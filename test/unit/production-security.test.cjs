const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
require('reflect-metadata');
const { AuthService } = require('../../apps/api/dist/common/auth/auth.service');
const { assertProductionConfig } = require('../../apps/api/dist/common/http/production-config');
const { securityMiddleware } = require('../../apps/api/dist/common/http/security.middleware');
const valid = { NODE_ENV: 'production', AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://issuer.example',
  OIDC_JWKS_URL: 'https://issuer.example/keys', OIDC_AUDIENCE: 'passport-api',
  WEB_ORIGIN: 'https://passport.example', RESOLVER_BASE_URL: 'https://api.example/v1/public/b',
  SUPPLIER_PORTAL_BASE_URL: 'https://passport.example/supplier', RESTRICTED_ACCESS_BASE_URL: 'https://passport.example/access',
  MALWARE_SCANNER: 'clamav', CLAMAV_HOST: 'clamav.internal' };
const auth = env => new AuthService({ get: key => env[key] });

test('production refuses missing or unsafe authentication, origins and scanner configuration', () => {
  assert.doesNotThrow(() => { assertProductionConfig(valid); auth(valid); });
  for (const name of Object.keys(valid).filter(key => key !== 'NODE_ENV')) {
    const env = { ...valid }; delete env[name];
    assert.throws(() => assertProductionConfig(env), name);
  }
  for (const patch of [{ AUTH_MODE: 'dev' }, { AUTH_MODE: 'typo' }, { WEB_ORIGIN: '*' },
    { WEB_ORIGIN: 'https://passport.example/path' }, { WEB_ORIGIN: 'https://passport.example,http://local' },
    { OIDC_ISSUER: 'http://issuer.example' }, { OIDC_JWKS_URL: 'https://user:pass@issuer.example/keys' },
    { RESOLVER_BASE_URL: 'https://api.example/#fragment' }, { MALWARE_SCANNER: 'disabled' },
    { SUPPLIER_PORTAL_BASE_URL: 'http://localhost:3000/supplier' }, { RESTRICTED_ACCESS_BASE_URL: 'http://localhost:3000/access' }]) {
    assert.throws(() => assertProductionConfig({ ...valid, ...patch }), JSON.stringify(patch));
  }
});

test('OIDC rejects unsafe algorithm and claim mappings at startup, including bypassing main', () => {
  for (const patch of [{ AUTH_MODE: 'dev' }, { AUTH_MODE: 'invalid' }, { OIDC_ALLOWED_ALGORITHMS: 'HS256' },
    { OIDC_ALLOWED_ALGORITHMS: 'RS256,none' }, { OIDC_ORGANISATION_CLAIM: 'sub' },
    { OIDC_ROLE_CLAIM: '__proto__' }, { OIDC_ROLE_CLAIM: 'org_id' }, { OIDC_JWKS_COOLDOWN_MS: '0' },
    { OIDC_JWKS_CACHE_MAX_AGE_MS: 'Infinity' }, { OIDC_AUDIENCE: '' }, { OIDC_JWKS_URL: 'http://issuer.example/keys' }]) {
    assert.throws(() => auth({ ...valid, ...patch }), JSON.stringify(patch));
  }
});

function request(middleware, { address = '127.0.0.1', headers = {}, path = '/v1/organisations/current' } = {}) {
  const req = { headers, socket: { remoteAddress: address }, path, method: 'GET' };
  const res = new EventEmitter(); res.headers = {}; res.statusCode = 200;
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; res.emit('finish'); return res; };
  middleware(req, res, () => { res.passed = true; });
  return { req, res };
}

test('rate limit blocks spoofed forwarded addresses and recovers after its window', () => {
  let now = 1000;
  const middleware = securityMiddleware({ API_RATE_LIMIT_PER_MINUTE: '2' }, () => now, () => {});
  assert.equal(request(middleware).res.passed, true);
  assert.equal(request(middleware, { headers: { 'x-forwarded-for': 'different' } }).res.passed, true);
  const denied = request(middleware, { headers: { 'x-forwarded-for': 'another' } }).res;
  assert.equal(denied.statusCode, 429); assert.equal(denied.headers['Retry-After'], '60');
  assert.equal(request(middleware, { address: '127.0.0.2' }).res.passed, true);
  now += 60001; assert.equal(request(middleware).res.passed, true);
});

test('public authentication receives a stricter limit without blocking unrelated API requests', () => {
  for (const path of ['/v1/auth/dev-token', '/v1/supplier-portal/session', '/v1/restricted-access/session', '/V1/Supplier-Portal/session']) {
    const middleware = securityMiddleware({ API_RATE_LIMIT_PER_MINUTE: '10', AUTH_RATE_LIMIT_PER_MINUTE: '1' }, Date.now, () => {});
    assert.equal(request(middleware, { path }).res.passed, true);
    assert.equal(request(middleware, { path }).res.statusCode, 429);
    assert.equal(request(middleware).res.passed, true);
  }
});

test('request tracing excludes raw capability paths, query values and arbitrary caller IDs', () => {
  const events = [];
  const middleware = securityMiddleware({}, Date.now, event => events.push(event));
  const { req, res } = request(middleware, { path: '/v1/access/secret-token?token=another-secret', headers: { 'x-request-id': 'private-text', authorization: 'Bearer secret' } });
  req.route = { path: '/v1/access/:token' }; res.emit('finish');
  assert.match(req.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const output = JSON.stringify(events);
  for (const secret of ['private-text', 'secret-token', 'another-secret', 'Bearer']) assert.ok(!output.includes(secret));
  assert.equal(events[0].route, '/v1/access/:token');
});
