import { NextRequest, NextResponse } from 'next/server';
import { getAuth0Client } from '../../../lib/auth0';
import { hasTrustedRequestHost } from '../../../lib/auth-config';
import { appOrigin, sameOriginRequest } from '../../../lib/backend-policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: NextRequest) {
  try {
    const origin = appOrigin();
    if (!hasTrustedRequestHost(request.headers, origin) || !sameOriginRequest(request, origin)) return NextResponse.json({ message: 'Request origin is not allowed.' }, { status: 403, headers });
    const client = getAuth0Client();
    if (!client) throw new Error('Missing configuration');
    const session = await client.getSession();
    if (!session) return NextResponse.json({ configured: true, authenticated: false }, { headers });
    try { const access = await client.getAccessToken(); if (access.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error('Expired'); }
    catch { return NextResponse.json({ configured: true, authenticated: false }, { headers }); }
    const name = typeof session.user.name === 'string' ? session.user.name.slice(0, 100) : undefined;
    return NextResponse.json({ configured: true, authenticated: true, name }, { headers });
  } catch {
    return NextResponse.json({ configured: false, authenticated: false }, { status: 503, headers });
  }
}
