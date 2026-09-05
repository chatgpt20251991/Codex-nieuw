const roots = new Set([
  'organisations', 'battery-models', 'battery-items', 'compliance', 'evidence',
  'suppliers', 'supplier-requests', 'authorisations', 'passport-values',
  'passports', 'lifecycle', 'registry', 'access-grants',
]);
const loopback = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
export const MAX_REQUEST_BYTES = 1024 * 1024;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export function appOrigin() {
  const url = new URL(process.env.APP_BASE_URL || '');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && url.protocol === 'http:' && loopback(url.hostname)))) {
    throw new Error('Invalid application origin');
  }
  return url.origin;
}

export function sameOriginRequest(request: Request, origin: string) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const supplied = request.headers.get('origin');
  if (supplied && supplied !== origin) return false;
  return ['GET', 'HEAD'].includes(request.method) || supplied === origin;
}

export function backendUrl(segments: string[], search: string, origin: string) {
  if (!segments.length || segments.length > 8 || !roots.has(segments[0])
    || segments.some(part => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(part))
    || search.length > 4096 || (search !== '' && !search.startsWith('?'))) return null;
  const base = new URL(process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '');
  const app = new URL(origin);
  if (base.username || base.password || base.search || base.hash || base.pathname.replace(/\/$/, '') !== '/v1'
    || (base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback(base.hostname) && loopback(app.hostname)))) {
    throw new Error('Invalid backend origin');
  }
  // Every segment is restricted above; no browser input can replace the configured origin.
  base.pathname = `/v1/${segments.join('/')}`;
  base.search = search;
  return base;
}

export async function readBoundedBody(body: ReadableStream<Uint8Array> | null, maximum: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error('Body exceeds allowed size');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
