import { NextRequest, NextResponse } from 'next/server';

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

export function middleware(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const connections = new Set(["'self'"]);
  try {
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
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    ...(!development && request.nextUrl.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  // Incoming values are untrusted. Next must render with this request's fresh nonce.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return secureHeaders(response, request);
}

export const config = {
  // Keep middleware on document, navigation and prefetch requests. A client-set
  // prefetch header must never bypass the document security policy.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
