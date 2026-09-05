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
