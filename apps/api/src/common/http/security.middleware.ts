import { randomUUID } from 'node:crypto';
import { boundedInteger } from '../auth/auth-config';

type Bucket = { count: number; expires: number };

// A bounded per-process safety limit. An upstream WAF must enforce the shared
// production limit across replicas. Forwarded headers are never trusted here.
export function securityMiddleware(env: NodeJS.ProcessEnv = process.env, now = Date.now, log: (event: object) => void = event => console.log(JSON.stringify(event))) {
  const production = env.NODE_ENV === 'production';
  const limit = boundedInteger(env.API_RATE_LIMIT_PER_MINUTE, production ? 600 : 10000, 1, 100000, 'API_RATE_LIMIT_PER_MINUTE');
  const sensitiveLimit = boundedInteger(env.AUTH_RATE_LIMIT_PER_MINUTE, production ? 120 : 10000, 1, 10000, 'AUTH_RATE_LIMIT_PER_MINUTE');
  const buckets = new Map<string, Bucket>();
  let nextCleanup = 0;
  return (req: any, res: any, next: () => void) => {
    const started = now();
    // Do not echo arbitrary caller data into headers or structured logs.
    const supplied = req.headers['x-request-id'];
    const requestId = typeof supplied === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied) ? supplied : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => {
      // Route templates exclude capability tokens, identifiers and query values.
      const route = typeof req.route?.path === 'string' ? req.route.path : '[unmatched]';
      log({ event: 'http_request', requestId, method: req.method, route, status: res.statusCode, durationMs: Math.max(0, now() - started) });
    });
    if (started >= nextCleanup) {
      for (const [key, value] of buckets) if (value.expires <= started) buckets.delete(key);
      nextCleanup = started + 60000;
    }
    const address = String(req.socket?.remoteAddress || 'unknown');
    const sensitive = /^\/v1\/(auth|supplier-portal|restricted-access)(\/|$)/i.test(req.path || '');
    const keys: Array<[string, number]> = [['api:' + address, limit]];
    if (sensitive) keys.push(['sensitive:' + address, sensitiveLimit]);
    for (const [key, maximum] of keys) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.expires <= started) {
        if (!bucket && buckets.size >= 30000) {
          res.setHeader('Retry-After', '60');
          return res.status(429).json({ code: 'RATE_LIMITED', requestId });
        }
        bucket = { count: 0, expires: started + 60000 };
        buckets.set(key, bucket);
      }
      if (++bucket.count > maximum) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.expires - started) / 1000))));
        return res.status(429).json({ code: 'RATE_LIMITED', requestId });
      }
    }
    next();
  };
}
