const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const rules = require('@eubp/rules');
const id = '42f0a790-4eb9-4316-b2c7-d11f65e5f722';
const publicField = rules.fields.find(field => field.access_tier === 'public');
const compile = filename => ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../apps/web/lib', filename), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(upstream = new Response(JSON.stringify(snapshot()), { headers: { 'content-type': 'application/json' } }), env = {}) {
  const policy = {};
  new Function('exports', 'process', compile('backend-policy.ts'))(policy, { env: {
    NODE_ENV: 'production', APP_BASE_URL: 'https://passport.example', API_BASE_URL: 'https://api.example/v1', ...env,
  } });
  const modules = { 'server-only': {}, '@eubp/rules': rules, './backend-policy': policy };
  const calls = [], helper = {};
  new Function('exports', 'require', 'fetch', compile('public-passport.ts'))(helper, name => {
    assert(Object.hasOwn(modules, name), `Unexpected helper dependency ${name}`);
    return modules[name];
  }, async (target, options) => {
    calls.push({ target: String(target), options });
    return typeof upstream === 'function' ? upstream() : upstream;
  });
  return { helper, calls };
}

function snapshot() {
  return { schema: 'eubatterypassport.v2', ruleSetVersion: 'EU-BR-2026.08', generatedAt: '2026-10-09T10:00:00.000Z',
    battery: { publicId: id, modelIdentifier: 'PUBLIC-MODEL', serial: 'PUBLIC-SERIAL', category: 'EV' },
    values: [{ fieldId: publicField.id, name: 'Untrusted field name', value: 'Public battery information' }] };
}

test('public scan loader reaches only the configured public snapshot path without forwarding credentials', async () => {
  const f = fixture();
  const result = await f.helper.loadPublicPassport(id.toUpperCase());
  assert.equal(result.status, 'ok');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].target, `https://api.example/v1/public/b/${id}`);
  const options = f.calls[0].options;
  assert.equal(options.method, 'GET');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
  assert.deepEqual(options.headers, { accept: 'application/json' });
  assert(options.signal instanceof AbortSignal);
});

test('projection follows the public rule catalogue and drops forged access tiers and private metadata', () => {
  const f = fixture(), raw = snapshot();
  Object.assign(raw, { organisationId: 'secret-organisation', registered: true, canonicalJson: { secret: 'canonical-secret' }, evidenceIds: ['secret-evidence'] });
  Object.assign(raw.battery, { id: 'internal-item', modelId: 'internal-model', lifecycleStatus: 'private-lifecycle' });
  raw.values[0].name = 'forged-private-label';
  raw.values[0].evidenceIds = ['secret-evidence'];
  raw.values[0].accessTier = 'public';
  raw.values[0].value = { visible: 'public-data', evidenceIds: ['nested-secret'], details: { organisationId: 'nested-organisation', weight: 100 } };
  for (let fieldId = 45; fieldId <= 50; fieldId++) {
    assert(!rules.publicFieldIds().includes(fieldId));
    raw.values.push({ fieldId, accessTier: 'public', name: 'Forged public tier', value: `restricted-secret-${fieldId}` });
  }
  const projected = f.helper.projectPublicPassport(raw, id);
  assert.equal(projected.values.length, 1);
  assert.equal(projected.values[0].name, publicField.name);
  assert.deepEqual(projected.values[0].value, { visible: 'public-data', details: { weight: 100 } });
  const serialized = JSON.stringify(projected);
  for (const forbidden of ['secret', 'registered', 'canonicalJson', 'evidenceIds', 'internal-item', 'internal-model', 'private-lifecycle', 'accessTier', 'forged-private-label']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('invalid identifiers cannot become an SSRF target or cause any upstream request', async () => {
  const f = fixture();
  for (const invalid of ['', 'not-a-uuid', '//evil.example', 'https://evil.example', id + '/other', id + '?next=x', '../' + id, id.replace(/-/g, '')]) {
    assert.deepEqual(await f.helper.loadPublicPassport(invalid), { status: 'not_found' });
  }
  assert.equal(f.calls.length, 0);
  for (const env of [{ API_BASE_URL: 'https://user:password@api.example/v1' }, { API_BASE_URL: 'https://api.example/other' },
    { APP_BASE_URL: 'http://passport.example' }, { API_BASE_URL: 'http://api.example/v1' }]) {
    const misconfigured = fixture(undefined, env);
    assert.deepEqual(await misconfigured.helper.loadPublicPassport(id), { status: 'unavailable' });
    assert.equal(misconfigured.calls.length, 0);
  }
});

test('missing, redirected or unavailable public snapshots never become a displayed passport', async () => {
  for (const [response, expected] of [
    [new Response('not found', { status: 404 }), 'not_found'],
    [new Response('private server diagnostic', { status: 503 }), 'unavailable'],
    [new Response(null, { status: 302, headers: { location: 'https://evil.example' } }), 'unavailable'],
    [new Response('<html>not a passport</html>', { headers: { 'content-type': 'text/html' } }), 'unavailable'],
    [new Response('{invalid', { headers: { 'content-type': 'application/json' } }), 'unavailable'],
    [new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }), 'unavailable'],
    [() => { throw new Error('private network diagnostic'); }, 'unavailable'],
  ]) {
    const f = fixture(response);
    assert.deepEqual(await f.helper.loadPublicPassport(id), { status: expected });
    assert.equal(f.calls.length, 1);
  }
});

test('public snapshots are bounded by actual streamed bytes and oversized bodies are cancelled', async () => {
  const f = fixture();
  const maximum = f.helper.MAX_PUBLIC_PASSPORT_BYTES;
  const declared = fixture(new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(maximum + 1) } }));
  assert.deepEqual(await declared.helper.loadPublicPassport(id), { status: 'unavailable' });
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(maximum)); controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
  const streamed = fixture(new Response(stream, { headers: { 'content-type': 'application/json', 'content-length': '1' } }));
  assert.deepEqual(await streamed.helper.loadPublicPassport(id), { status: 'unavailable' });
  assert.equal(cancelled, true);
});

test('projection rejects mismatched identity, ambiguous duplicates and malformed structured values', () => {
  const f = fixture();
  const wrong = snapshot(); wrong.battery.publicId = 'a3c9d53f-3b90-46ce-84ed-f00c302810d6';
  assert.equal(f.helper.projectPublicPassport(wrong, id), null);
  const duplicates = snapshot(); duplicates.values.push({ ...duplicates.values[0] });
  assert.equal(f.helper.projectPublicPassport(duplicates, id), null);
  const restrictedOnly = snapshot(); restrictedOnly.values = [{ fieldId: 50, value: 'authority-only' }];
  assert.equal(f.helper.projectPublicPassport(restrictedOnly, id), null);
  const invalid = snapshot(); invalid.values[0].value = Infinity;
  assert.equal(f.helper.projectPublicPassport(invalid, id), null);
  assert.equal(f.helper.projectPublicPassport({ ...snapshot(), values: undefined }, id), null);
  assert.equal(f.helper.displayPublicValue(null), 'Not supplied');
  assert.equal(f.helper.displayPublicValue({ capacity: 100 }), '{"capacity":100}');
});
