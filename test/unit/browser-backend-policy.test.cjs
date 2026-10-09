const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../../apps/web/lib/backend-policy.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const environment = { NODE_ENV: 'production', APP_BASE_URL: 'https://passport.example', API_BASE_URL: 'https://api.example/v1' };
const exported = {};
new Function('exports', 'process', compiled)(exported, { env: environment });

test('BFF mutations require the exact configured Origin, including for same-site sibling hosts', () => {
  const allowed = headers => exported.sameOriginRequest(new Request('https://passport.example/api/backend/suppliers', { method: 'POST', headers }), 'https://passport.example');
  assert.equal(allowed({ origin: 'https://passport.example' }), true);
  for (const headers of [{}, { origin: 'null' }, { origin: 'https://evil.example' }, { origin: 'https://sub.passport.example', 'sec-fetch-site': 'same-site' }, { origin: 'https://passport.example', 'sec-fetch-site': 'cross-site' }]) assert.equal(allowed(headers), false);
  assert.equal(exported.sameOriginRequest(new Request('https://passport.example/api/backend/suppliers'), 'https://passport.example'), true);
});

test('BFF routing cannot become an open proxy or reach authentication/capability endpoints', () => {
  for (const segments of [[], ['auth', 'dev-token'], ['restricted-access', 'session'], ['supplier-portal', 'session'], ['public', 'b'], ['evidence', '..', 'auth'], ['evidence', '%2e%2e'], ['evidence', '//evil.example'], ['evidence', 'a?redirect=x'], ['evidence', 'a\\b']]) {
    assert.equal(exported.backendUrl(segments, '', 'https://passport.example'), null);
  }
  assert.equal(exported.backendUrl(['battery-models'], '?next=https://evil.example/a', 'https://passport.example').href, 'https://api.example/v1/battery-models?next=https://evil.example/a');
  assert.equal(exported.backendUrl(['registry', 'items', 'item-123', 'gate'], '', 'https://passport.example').origin, 'https://api.example');
});

const qrItemId = 'b75efc93-a2a5-4e9c-9f7c-3e5c845eef34';
const qrPath = ['passports', qrItemId, 'qr.svg'];

test('BFF allows only the exact UUID passport QR download for GET and HEAD', () => {
  for (const method of ['GET', 'HEAD']) {
    assert.equal(exported.backendUrl(qrPath, '', 'https://passport.example', method).href,
      `https://api.example/v1/passports/${qrItemId}/qr.svg`);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal(exported.backendUrl(qrPath, '', 'https://passport.example', method), null);
  }
  for (const segments of [
    ['passports', 'not-a-uuid', 'qr.svg'], ['passports', qrItemId, 'other.svg'],
    ['passports', qrItemId, 'qr.svg', 'extra'], ['passports', qrItemId, 'qr.svg/extra'],
    ['passports', qrItemId, 'qr%2esvg'], ['passports', qrItemId, 'qr.SVG'],
    ['passports', qrItemId, '../qr.svg'], ['evidence', qrItemId, 'qr.svg'],
    ['passports', qrItemId + '.svg', 'qr.svg'], ['passports', 'https://evil.example', 'qr.svg'],
  ]) assert.equal(exported.backendUrl(segments, '', 'https://passport.example', 'GET'), null);
});

// Execute the real route against controlled auth and upstream responses. Tokens
// stay server-side; no provider account, network or customer data is needed.
function qrRouteFixture({ upstream, session = {}, access, clientConfigured = true } = {}) {
  const next = require('next/server');
  const authSource = fs.readFileSync(path.join(__dirname, '../../apps/web/lib/auth-config.ts'), 'utf8');
  const authCompiled = ts.transpileModule(authSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const authExports = {};
  new Function('exports', authCompiled)(authExports);
  const calls = [];
  const client = {
    getSession: async () => session,
    getAccessToken: async () => access || { token: 'synthetic-session-access-token', expiresAt: Math.floor(Date.now() / 1000) + 60 },
  };
  const modules = {
    'next/server': next,
    '../../../../lib/auth0': { getAuth0Client: () => clientConfigured ? client : null },
    '../../../../lib/auth-config': authExports,
    '../../../../lib/backend-policy': exported,
  };
  const routeSource = fs.readFileSync(path.join(__dirname, '../../apps/web/app/api/backend/[...path]/route.ts'), 'utf8');
  const routeCompiled = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const route = {};
  new Function('exports', 'require', 'fetch', routeCompiled)(route, name => {
    assert(Object.hasOwn(modules, name), `Unexpected route dependency: ${name}`);
    return modules[name];
  }, async (target, options) => {
    calls.push({ target, options });
    return typeof upstream === 'function' ? upstream() : upstream;
  });
  const invoke = (method = 'GET', headers = {}, segments = qrPath, init = {}) => route[method](
    new next.NextRequest(`https://passport.example/api/backend/${segments.join('/')}`, {
      ...init, method, headers: { host: 'passport.example', ...headers },
    }), { params: Promise.resolve({ path: segments }) });
  return { invoke, calls };
}

test('QR GET returns a private bounded SVG attachment with restrictive CSP and trusted credentials only', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';
  const fixture = qrRouteFixture({ upstream: new Response(svg, { headers: {
    'content-type': 'image/svg+xml; charset=utf-8', 'set-cookie': 'upstream=must-not-leak',
    'content-disposition': 'inline; filename="untrusted.svg"',
  } }) });
  const response = await fixture.invoke('GET', {
    authorization: 'Bearer browser-value', cookie: 'browser=value', 'x-forwarded-host': 'evil.example',
    'x-acting-organisation-id': qrItemId,
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), svg);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.equal(response.headers.get('content-disposition'), `attachment; filename="battery-passport-${qrItemId}-qr.svg"`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /(?:^|;)\s*sandbox(?:;|$)/);
  for (const directive of ['default-src', 'script-src', 'connect-src', 'object-src', 'frame-ancestors']) {
    assert(response.headers.get('content-security-policy').includes(`${directive} 'none'`));
  }
  assert.equal(response.headers.get('set-cookie'), null);
  const { target, options } = fixture.calls[0];
  assert.equal(target.href, `https://api.example/v1/passports/${qrItemId}/qr.svg`);
  assert.equal(options.headers.get('authorization'), 'Bearer synthetic-session-access-token');
  assert.equal(options.headers.get('x-acting-organisation-id'), qrItemId);
  assert.equal(options.headers.get('cookie'), null);
  assert.equal(options.headers.get('x-forwarded-host'), null);
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
});

test('QR HEAD uses the same authentication and SVG attachment policy without a response body', async () => {
  const fixture = qrRouteFixture({ upstream: new Response(null, { headers: { 'content-type': 'image/svg+xml' } }) });
  const response = await fixture.invoke('HEAD');
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.match(response.headers.get('content-disposition'), /^attachment;/);
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(fixture.calls[0].options.method, 'HEAD');
});

test('QR requests retain host, origin, session, expiry and acting-organisation protection', async () => {
  for (const headers of [
    { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' },
    { host: 'evil.example', 'x-forwarded-host': 'passport.example' },
  ]) {
    const fixture = qrRouteFixture();
    assert.equal((await fixture.invoke('GET', headers)).status, 403);
    assert.equal(fixture.calls.length, 0);
  }
  for (const config of [{ session: null }, { access: { token: 'expired', expiresAt: 0 } }]) {
    const fixture = qrRouteFixture(config);
    assert.equal((await fixture.invoke()).status, 401);
    assert.equal(fixture.calls.length, 0);
  }
  const unconfigured = qrRouteFixture({ clientConfigured: false });
  assert.equal((await unconfigured.invoke()).status, 503);
  assert.equal(unconfigured.calls.length, 0);
  const invalidTenant = qrRouteFixture();
  assert.equal((await invalidTenant.invoke('GET', { 'x-acting-organisation-id': 'untrusted-tenant' })).status, 400);
  assert.equal(invalidTenant.calls.length, 0);
});

test('QR route rejects mutating methods and non-QR file paths before any upstream request', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const fixture = qrRouteFixture();
    assert.equal((await fixture.invoke(method, { origin: 'https://passport.example' })).status, 404);
    assert.equal(fixture.calls.length, 0);
  }
  for (const segments of [['passports', 'invalid', 'qr.svg'], ['passports', qrItemId, 'other.svg']]) {
    const fixture = qrRouteFixture();
    assert.equal((await fixture.invoke('GET', {}, segments)).status, 404);
    assert.equal(fixture.calls.length, 0);
  }
});

test('QR failures remain JSON and do not expose SVG downloads for denied tenants or unexpected MIME types', async () => {
  const denied = qrRouteFixture({ upstream: Response.json({ code: 'TENANT_FORBIDDEN' }, { status: 403 }) });
  const response = await denied.invoke();
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: 'TENANT_FORBIDDEN' });
  assert.equal(response.headers.get('content-disposition'), null);
  for (const contentType of ['text/html', 'application/json', 'image/svg+xml-evil', '']) {
    for (const method of ['GET', 'HEAD']) {
      const fixture = qrRouteFixture({ upstream: new Response('untrusted', { headers: { 'content-type': contentType } }) });
      const failure = await fixture.invoke(method);
      assert.equal(failure.status, 502);
      assert.equal(failure.headers.get('content-disposition'), null);
      assert.equal((await failure.json()).message, 'The service returned an unexpected response.');
    }
  }
});

test('QR download limits count streamed bytes and reject oversized or invalid UTF-8 responses', async () => {
  let cancelled = false;
  const oversized = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(exported.MAX_QR_RESPONSE_BYTES + 1)); },
    cancel() { cancelled = true; },
  });
  for (const body of [oversized, new Uint8Array([0xff])]) {
    const fixture = qrRouteFixture({ upstream: new Response(body, { headers: { 'content-type': 'image/svg+xml' } }) });
    const response = await fixture.invoke();
    assert.equal(response.status, 502);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.equal(response.headers.get('content-disposition'), null);
  }
  assert.equal(cancelled, true);
});

test('ordinary BFF endpoints remain JSON-only and do not inherit QR download handling', async () => {
  const segments = ['passports', qrItemId, 'versions'];
  const fixture = qrRouteFixture({ upstream: Response.json({ versions: [] }) });
  const response = await fixture.invoke('GET', {}, segments);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { versions: [] });
  assert.equal(response.headers.get('content-disposition'), null);
  assert.equal(fixture.calls[0].options.headers.get('accept'), 'application/json');
  const unexpected = qrRouteFixture({ upstream: new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) });
  assert.equal((await unexpected.invoke('GET', {}, segments)).status, 502);
});

test('bodyless POST commands accept an HTTP-adapter empty stream and preserve server-side credentials', async () => {
  for (const segments of [
    ['passports', qrItemId, 'validate'], ['passports', qrItemId, 'publish'],
    ['evidence', qrItemId, 'verify'], ['evidence', qrItemId, 'review-download'],
    ['passport-values', qrItemId, 'validate'],
  ]) {
    for (const contentType of [undefined, 'application/json', 'text/plain']) {
      const fixture = qrRouteFixture({ upstream: Response.json({ publishable: false }, { status: 201 }) });
      const empty = new ReadableStream({ start(controller) { controller.close(); } });
      const response = await fixture.invoke('POST', { origin: 'https://passport.example',
        authorization: 'Bearer browser-token', cookie: 'browser=value', 'content-length': '0',
        ...(contentType ? { 'content-type': contentType } : {}) }, segments, { body: empty, duplex: 'half' });
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { publishable: false });
      assert.equal(fixture.calls.length, 1);
      const { options } = fixture.calls[0];
      assert.equal(options.body, undefined); assert.equal(options.headers.get('content-type'), null);
      assert.equal(options.headers.get('content-length'), null); assert.equal(options.headers.get('cookie'), null);
      assert.equal(options.headers.get('authorization'), 'Bearer synthetic-session-access-token');
    }
  }
});

test('bodyless commands still require trusted origin and an authenticated unexpired session', async () => {
  const segments = ['passports', qrItemId, 'validate'];
  for (const { config, headers, status } of [
    { config: {}, headers: {}, status: 403 },
    { config: {}, headers: { origin: 'https://evil.example' }, status: 403 },
    { config: { session: null }, headers: { origin: 'https://passport.example' }, status: 401 },
    { config: { access: { token: 'expired', expiresAt: 0 } }, headers: { origin: 'https://passport.example' }, status: 401 },
  ]) {
    const fixture = qrRouteFixture(config);
    const empty = new ReadableStream({ start(controller) { controller.close(); } });
    assert.equal((await fixture.invoke('POST', headers, segments, { body: empty, duplex: 'half' })).status, status);
    assert.equal(fixture.calls.length, 0);
  }
});

test('non-empty mutations retain MIME, UTF-8, JSON and actual streamed-byte limits', async () => {
  const segments = ['passports', qrItemId, 'validate'];
  for (const { body, contentType, status } of [
    { body: '{}', status: 415 },
    { body: '{}', contentType: 'text/plain', status: 415 },
    { body: 'field=value', contentType: 'application/x-www-form-urlencoded', status: 415 },
    { body: '<html>not-json</html>', contentType: 'application/json', status: 400 },
    { body: new Uint8Array([0xff]), contentType: 'application/json', status: 400 },
    { body: new Uint8Array(exported.MAX_REQUEST_BYTES + 1), contentType: 'application/json', status: 400 },
    { body: new Uint8Array(exported.MAX_REQUEST_BYTES + 1), contentType: 'application/x-www-form-urlencoded', status: 400 },
  ]) {
    const fixture = qrRouteFixture();
    const headers = { origin: 'https://passport.example', ...(contentType ? { 'content-type': contentType } : {}) };
    assert.equal((await fixture.invoke('POST', headers, segments, { body })).status, status);
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = qrRouteFixture({ upstream: Response.json({ ok: true }, { status: 201 }) });
  const response = await fixture.invoke('POST', { origin: 'https://passport.example', 'content-type': 'application/json' },
    segments, { body: '{"actual":"payload"}' });
  assert.equal(response.status, 201);
  assert.equal(fixture.calls[0].options.body, '{"actual":"payload"}');
  assert.equal(fixture.calls[0].options.headers.get('content-type'), 'application/json');
});

test('Production browser and backend origins reject insecure and credential-bearing configuration', () => {
  for (const url of ['http://passport.example', 'http://localhost:3000', 'https://user:password@passport.example', 'https://passport.example/nested', 'https://passport.example?redirect=x']) {
    environment.APP_BASE_URL = url;
    assert.throws(() => exported.appOrigin());
  }
  environment.APP_BASE_URL = 'https://passport.example';
  for (const url of ['http://api.example/v1', 'http://localhost:4000/v1', 'https://user:password@api.example/v1', 'https://api.example/other', 'https://api.example/v1?next=x']) {
    environment.API_BASE_URL = url;
    assert.throws(() => exported.backendUrl(['suppliers'], '', 'https://passport.example'));
  }
  environment.API_BASE_URL = 'https://api.example/v1';
  assert.equal(exported.appOrigin(), 'https://passport.example');
});

test('Body size limits count actual streamed bytes and cancel oversized streams', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } });
  await assert.rejects(exported.readBoundedBody(body, 7), /size/);
  assert.equal(cancelled, true);
  const exact = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); controller.close(); } });
  assert.deepEqual([...await exported.readBoundedBody(exact, 4)], [1, 2, 3, 4]);
});
