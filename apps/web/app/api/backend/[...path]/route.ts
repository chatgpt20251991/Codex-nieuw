import { NextRequest, NextResponse } from 'next/server';
import { getAuth0Client } from '../../../../lib/auth0';
import { hasTrustedRequestHost } from '../../../../lib/auth-config';
import { appOrigin, backendUrl, isPassportQrPath, MAX_QR_RESPONSE_BYTES, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, readBoundedBody, sameOriginRequest } from '../../../../lib/backend-policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const responseHeaders = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const failure = (status: number, message: string) => NextResponse.json({ message }, { status, headers: responseHeaders });

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  let client: ReturnType<typeof getAuth0Client>;
  let target: URL | null;
  let qrPath = false;
  let itemId = '';
  try {
    const origin = appOrigin();
    if (!hasTrustedRequestHost(request.headers, origin) || !sameOriginRequest(request, origin)) return failure(403, 'Request origin is not allowed.');
    const segments = (await context.params).path;
    target = backendUrl(segments, request.nextUrl.search, origin, request.method);
    if (!target) return failure(404, 'Endpoint unavailable.');
    qrPath = isPassportQrPath(segments);
    if (qrPath) itemId = segments[1];
    client = getAuth0Client();
    if (!client) return failure(503, 'Sign-in is not configured.');
  } catch { return failure(503, 'Sign-in is not configured.'); }

  let token: string;
  try {
    if (!await client.getSession()) return failure(401, 'Sign in to continue.');
    const access = await client.getAccessToken();
    if (!access.token || access.expiresAt <= Math.floor(Date.now() / 1000)) return failure(401, 'Your session has expired. Sign in again.');
    token = access.token;
  } catch { return failure(401, 'Your session has expired. Sign in again.'); }

  // Never forward browser credentials, cookies, proxy headers or capability tokens.
  const headers = new Headers({ authorization: `Bearer ${token}`, accept: qrPath ? 'image/svg+xml, application/json' : 'application/json' });
  const actingOrg = request.headers.get('x-acting-organisation-id');
  if (actingOrg) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actingOrg)) return failure(400, 'Invalid organisation identifier.');
    // This is only a request to act on behalf of a customer. The API still requires live written authorisation.
    headers.set('x-acting-organisation-id', actingOrg);
  }
  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    try {
      const bytes = await readBoundedBody(request.body, MAX_REQUEST_BYTES);
      // Next's HTTP adapter may represent a bodyless POST as an empty stream.
      // Judge the actual bytes: command endpoints need no payload, whereas
      // every non-empty mutation still requires bounded, valid JSON.
      if (bytes.byteLength) {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return failure(415, 'A JSON request is required.');
        body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        JSON.parse(body);
        headers.set('content-type', 'application/json');
      }
    } catch { return failure(400, 'Invalid or oversized JSON request.'); }
  }
  try {
    const upstream = await fetch(target, { method: request.method, headers, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (qrPath && upstream.ok && upstream.status !== 204) {
      if (!/^image\/svg\+xml(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) return failure(502, 'The service returned an unexpected response.');
      const qrHeaders = {
        ...responseHeaders,
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="battery-passport-${itemId.toLowerCase()}-qr.svg"`,
        'Content-Security-Policy': "sandbox; default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      };
      if (request.method === 'HEAD') return new NextResponse(null, { status: upstream.status, headers: qrHeaders });
      const svg = new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(upstream.body, MAX_QR_RESPONSE_BYTES));
      return new NextResponse(svg, { status: upstream.status, headers: qrHeaders });
    }
    if (upstream.status === 204 || request.method === 'HEAD') return new NextResponse(null, { status: upstream.status, headers: responseHeaders });
    if (!/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) return failure(502, 'The service returned an unexpected response.');
    const data = JSON.parse(new TextDecoder().decode(await readBoundedBody(upstream.body, MAX_RESPONSE_BYTES)));
    return NextResponse.json(data, { status: upstream.status, headers: responseHeaders });
  } catch { return failure(502, 'The service is temporarily unavailable.'); }
}

export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
