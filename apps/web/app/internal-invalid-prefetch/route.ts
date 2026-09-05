export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('Invalid prefetch request.', {
    status: 400,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Middleware owns the enforced CSP and generates a fresh nonce even for
      // this plain-text rejection. Next preserves that existing response header.
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
