import { NextRequest, NextResponse } from 'next/server';
import { getAuth0Client } from './lib/auth0';
import { hasSameOrigin, hasTrustedRequestHost, readAuth0Config } from './lib/auth-config';

const development = process.env.NODE_ENV === 'development';
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/v1';
const uploadOrigin = process.env.NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN
  || (development ? 'http://localhost:9000' : '');

function isLoopback(host: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(host);
}

function allowedOrigin(value: string, request: NextRequest, originOnly = false) {
  const url = new URL(value, request.nextUrl.origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.hash || (originOnly && (url.pathname !== '/' || url.search))) {
    throw new Error('Invalid browser service origin');
  }
  if (!development && url.protocol !== 'https:'
    && !(isLoopback(url.hostname) && isLoopback(request.nextUrl.hostname))) {
    throw new Error('Production browser services require HTTPS');
  }
  return url.origin;
}

function secureHeaders(response: NextResponse, request: NextRequest) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (!development && request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const authConfig = readAuth0Config();
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const connections = new Set(["'self'"]);
  try {
    // Operator bearer tokens use the BFF. Existing supplier/access capability
    // portals still call this explicitly configured API origin directly.
    connections.add(allowedOrigin(apiUrl, request));
    if (uploadOrigin) connections.add(allowedOrigin(uploadOrigin, request, true));
  } catch {
    const response = new NextResponse('Web security configuration is incomplete.', { status: 503 });
    response.headers.set('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    return secureHeaders(response, request);
  }
  if (development) {
    connections.add(`${request.nextUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${request.nextUrl.host}`);
  }
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `style-src-attr ${development ? "'unsafe-inline'" : "'none'"}`,
    `connect-src ${[...connections].join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    `form-action 'self'${authConfig ? ` https://${authConfig.domain}` : ''}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    ...(!development && request.nextUrl.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  // Incoming values are untrusted. Next must render with this request's fresh nonce.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  let response: NextResponse;
  const path = request.nextUrl.pathname;
  if (path === '/auth' || path.startsWith('/auth/')) {
    // SDK v4 also has account, passkey, passwordless and token routes. Only the
    // reviewed authorization-code flow is mounted by this application.
    if (!['/auth/login', '/auth/callback', '/auth/logout'].includes(path)) {
      response = new NextResponse('Not found.', { status: 404 });
    } else if ((path === '/auth/logout' && request.method !== 'POST')
      || (path !== '/auth/logout' && request.method !== 'GET')) {
      response = new NextResponse('Method not allowed.', { status: 405,
        headers: { Allow: path === '/auth/logout' ? 'POST' : 'GET' } });
    } else if (!authConfig) {
      response = new NextResponse('Sign-in is not configured.', { status: 503 });
    } else if (!hasTrustedRequestHost(request.headers, authConfig.appBaseUrl)
      || (path === '/auth/logout' && !hasSameOrigin(request.headers, authConfig.appBaseUrl))) {
      response = new NextResponse('Request origin is not allowed.', { status: 403 });
    } else if (path !== '/auth/callback' && request.nextUrl.search) {
      response = new NextResponse('Authentication parameters are fixed by the application.', { status: 400 });
    } else {
      try {
        const auth0 = getAuth0Client();
        if (!auth0) throw new Error('Authentication configuration unavailable');
        // The SDK mounts logout as GET. Convert only this already-validated
        // same-origin POST internally; a public GET cannot trigger logout.
        const sdkRequest = new NextRequest(request.url, { method: 'GET', headers: requestHeaders });
        response = await auth0.middleware(sdkRequest);
        if (path === '/auth/logout' && response.headers.has('location')) {
          const redirect = NextResponse.redirect(response.headers.get('location')!, 303);
          for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
          response = redirect;
        }
        if (response.status >= 400) {
          const failure = new NextResponse(path === '/auth/callback' ? 'Sign-in failed. Please try again.' : 'Authentication service is unavailable.',
            { status: path === '/auth/callback' ? 400 : 502 });
          for (const cookie of response.cookies.getAll()) failure.cookies.set(cookie);
          response = failure;
        }
      } catch {
        response = new NextResponse(path === '/auth/callback' ? 'Sign-in failed. Please try again.' : 'Authentication service is unavailable.',
          { status: path === '/auth/callback' ? 400 : 502 });
      }
    }
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (path === '/auth/callback' && response.status >= 400 && authConfig) {
    // SDK callback hooks can fail before its normal transaction cleanup runs.
    // Clear only the fixed transaction cookie, preserving any existing session.
    response.cookies.set(authConfig.secure ? '__Host-eubp_txn_' : 'eubp_dev_txn_', '', {
      httpOnly: true, secure: authConfig.secure, sameSite: 'lax', path: '/', maxAge: 0, expires: new Date(0),
    });
  }
  response.headers.set('Content-Security-Policy', policy);
  return secureHeaders(response, request);
}

export const config = {
  // Stable since Next 15.5; the OIDC SDK and TLS trust use the server Node runtime.
  runtime: 'nodejs',
  // Keep middleware on document, navigation and prefetch requests. A client-set
  // prefetch header must never bypass the document security policy.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
