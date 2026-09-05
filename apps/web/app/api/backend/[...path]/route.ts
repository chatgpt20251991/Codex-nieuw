import { NextRequest, NextResponse } from 'next/server';
import { getAuth0Client } from '../../../../lib/auth0';
import { hasTrustedRequestHost } from '../../../../lib/auth-config';
import { appOrigin, backendUrl, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, readBoundedBody, sameOriginRequest } from '../../../../lib/backend-policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const responseHeaders = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const failure = (status: number, message: string) => NextResponse.json({ message }, { status, headers: responseHeaders });

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  let client: ReturnType<typeof getAuth0Client>;
  let target: URL | null;
  try {
    const origin = appOrigin();
    if (!hasTrustedRequestHost(request.headers, origin) || !sameOriginRequest(request, origin)) return failure(403, 'Request origin is not allowed.');
    target = backendUrl((await context.params).path, request.nextUrl.search, origin);
    if (!target) return failure(404, 'Endpoint unavailable.');
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
  const headers = new Headers({ authorization: `Bearer ${token}`, accept: 'application/json' });
  const actingOrg = request.headers.get('x-acting-organisation-id');
  if (actingOrg) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actingOrg)) return failure(400, 'Invalid organisation identifier.');
    // This is only a request to act on behalf of a customer. The API still requires live written authorisation.
    headers.set('x-acting-organisation-id', actingOrg);
  }
  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return failure(415, 'A JSON request is required.');
    try {
      const bytes = await readBoundedBody(request.body, MAX_REQUEST_BYTES);
      body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (body) JSON.parse(body);
    } catch { return failure(400, 'Invalid or oversized JSON request.'); }
    headers.set('content-type', 'application/json');
  }
  try {
    const upstream = await fetch(target, { method: request.method, headers, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (upstream.status === 204 || request.method === 'HEAD') return new NextResponse(null, { status: upstream.status, headers: responseHeaders });
    if (!/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) return failure(502, 'The service returned an unexpected response.');
    const data = JSON.parse(new TextDecoder().decode(await readBoundedBody(upstream.body, MAX_RESPONSE_BYTES)));
    return NextResponse.json(data, { status: upstream.status, headers: responseHeaders });
  } catch { return failure(502, 'The service is temporarily unavailable.'); }
}

export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
