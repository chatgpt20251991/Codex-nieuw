const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer: createHttpsServer } = require('node:https');
const { createServer: createPortListener } = require('node:net');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, relative, isAbsolute, basename } = require('node:path');
const { Client } = require('pg');

const root = resolve(__dirname, '../..');
const orgs = { A: randomUUID(), B: randomUUID() }, tokens = {}, models = {};
const audience = 'eubp-gate7-api';
const runtime = new Client({ connectionString: process.env.DATABASE_URL });
const children = [];
let jose, primaryKey, rotatedKey, unrelatedKey, ecKey, jwksKeys, issuerServer, issuer, jwksUrl, tlsDirectory, mainApi;
let runtimeConnected = false, jwksRequests = 0, unexpectedRequests = 0, issuerMode = 'normal';
const pauseForJwksRefresh = () => new Promise(resolve => setTimeout(resolve, 1100));

function createTestTls() {
  // Keys exist only inside this freshly generated temporary directory. They are
  // never application credentials, committed fixtures or global trust anchors.
  tlsDirectory = mkdtempSync(join(tmpdir(), 'eubp-oidc-'));
  const openssl = process.env.TEST_OPENSSL_EXECUTABLE || 'openssl';
  const run = args => {
    try { execFileSync(openssl, args, { cwd: tlsDirectory, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000 }); }
    catch (error) { throw new Error(`OpenSSL must be available to generate the isolated HTTPS OIDC fixture: ${error.message}`); }
  };
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2',
    '-subj', '/CN=EUBP TEST ONLY OIDC CA', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', 'ca-key.pem', '-out', 'ca-cert.pem']);
  run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=localhost',
    '-keyout', 'server-key.pem', '-out', 'server.csr']);
  writeFileSync(join(tlsDirectory, 'server-extensions.cnf'), [
    'basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '',
  ].join('\n'), { mode: 0o600 });
  run(['x509', '-req', '-in', 'server.csr', '-CA', 'ca-cert.pem', '-CAkey', 'ca-key.pem',
    '-CAcreateserial', '-days', '2', '-sha256', '-extfile', 'server-extensions.cnf', '-out', 'server-cert.pem']);
  return { key: readFileSync(join(tlsDirectory, 'server-key.pem')), cert: readFileSync(join(tlsDirectory, 'server-cert.pem')) };
}

async function publicJwk(key, kid, alg) {
  return { ...await jose.exportJWK(key.publicKey), kid, alg, use: 'sig' };
}

function claims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuer, aud: audience, sub: 'oidc-A', org_id: orgs.A,
    role: 'operator_admin', iat: now, exp: now + 600, ...overrides };
  // Undefined explicitly removes a claim so required-claim tests cannot get a
  // default restored by the fixture helper.
  for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
  return payload;
}

async function sign(overrides = {}, { key = primaryKey.privateKey, alg = 'RS256', kid = 'primary', header = {} } = {}) {
  return new jose.SignJWT(claims(overrides)).setProtectedHeader({ alg, kid, typ: 'JWT', ...header }).sign(key);
}

async function startApi(overrides = {}, { trustFixtureCa = true } = {}) {
  const listener = createPortListener(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env, NODE_ENV: 'production', AUTH_MODE: 'oidc', PORT: String(port),
    OIDC_ISSUER: issuer, OIDC_JWKS_URL: jwksUrl, OIDC_AUDIENCE: audience,
    OIDC_ORGANISATION_CLAIM: 'org_id', OIDC_ROLE_CLAIM: 'role', OIDC_ALLOWED_ALGORITHMS: 'RS256',
    OIDC_JWKS_COOLDOWN_MS: '1000', OIDC_JWKS_CACHE_MAX_AGE_MS: '1000',
    RESOLVER_BASE_URL: 'https://id.example.invalid/b', WEB_ORIGIN: 'https://app.example.invalid',
    SUPPLIER_PORTAL_BASE_URL: 'https://app.example.invalid/supplier', RESTRICTED_ACCESS_BASE_URL: 'https://app.example.invalid/access',
    MALWARE_SCANNER: 'clamav', CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '53310',
    BATTERY_SEMANTIC_CATALOGUE_AVAILABLE: 'false', REGISTRY_BATTERY_SUBMISSION_AVAILABLE: 'false',
    ...overrides };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (trustFixtureCa) env.NODE_EXTRA_CA_CERTS = join(tlsDirectory, 'ca-cert.pem');
  else delete env.NODE_EXTRA_CA_CERTS;
  const api = { base: `http://127.0.0.1:${port}/v1`, logs: '', process: spawn(process.execPath,
    ['apps/api/dist/main.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) };
  children.push(api);
  api.process.stdout.on('data', chunk => { api.logs = (api.logs + chunk).slice(-20000); });
  api.process.stderr.on('data', chunk => { api.logs = (api.logs + chunk).slice(-20000); });
  for (let attempt = 0; attempt < 240; attempt++) {
    if (api.process.exitCode !== null || api.process.signalCode !== null) throw new Error(`OIDC API exited: ${api.logs}`);
    try { if ((await fetch(api.base + '/health', { signal: AbortSignal.timeout(1000) })).ok) return api; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`OIDC API did not become ready: ${api.logs}`);
}

async function stopApi(api) {
  if (api.process.exitCode === null && api.process.signalCode === null) {
    const stopped = once(api.process, 'exit'); api.process.kill(); await stopped;
  }
}

async function request(path = '/organisations/current', { token = tokens.A, body, acting, api = mainApi, authorization } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (authorization !== undefined) headers.authorization = authorization;
  else if (token) headers.authorization = `Bearer ${token}`;
  if (acting) headers['x-acting-organisation-id'] = acting;
  const response = await fetch(api.base + path, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { status: response.status, data: await response.json() };
}

async function success(path, options) {
  const response = await request(path, options);
  assert.ok([200, 201].includes(response.status), `${path}: ${JSON.stringify(response)}`);
  return response.data;
}

async function denied(token, options = {}) {
  const response = await request('/organisations/current', { token, ...options });
  assert.equal(response.status, 401, JSON.stringify(response));
  assert.equal(response.data.code, 'INVALID_ACCESS_TOKEN');
  assert.ok(!JSON.stringify(response.data).includes(token), 'An authentication error must not echo bearer credentials.');
  return response;
}

before(async () => {
  jose = await import('jose');
  [primaryKey, rotatedKey, unrelatedKey, ecKey] = await Promise.all([
    jose.generateKeyPair('RS256'), jose.generateKeyPair('RS256'), jose.generateKeyPair('RS256'), jose.generateKeyPair('ES256'),
  ]);
  jwksKeys = [await publicJwk(primaryKey, 'primary', 'RS256'), await publicJwk(ecKey, 'ec-primary', 'ES256')];
  issuerServer = createHttpsServer(createTestTls(), (req, res) => {
    if (req.url !== '/issuer/jwks') { unexpectedRequests++; res.writeHead(404).end(); return; }
    jwksRequests++;
    if (issuerMode === 'unavailable') { res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":"fixture unavailable"}'); return; }
    if (issuerMode === 'malformed') { res.writeHead(200, { 'content-type': 'application/json' }).end('not valid JSON'); return; }
    if (issuerMode === 'redirect') { res.writeHead(302, { location: issuer + '/untrusted-redirect' }).end(); return; }
    res.writeHead(200, { 'content-type': 'application/jwk-set+json', 'cache-control': 'no-store' }).end(JSON.stringify({ keys: jwksKeys }));
  });
  // Expected in the explicit untrusted-CA scenario. The API must still reject it.
  issuerServer.on('tlsClientError', () => {});
  issuerServer.listen(0, '127.0.0.1'); await once(issuerServer, 'listening');
  issuer = `https://127.0.0.1:${issuerServer.address().port}/issuer`;
  jwksUrl = issuer + '/jwks';
  for (const actor of Object.keys(orgs)) tokens[actor] = await sign({ sub: `oidc-${actor}`, org_id: orgs[actor] });
  mainApi = await startApi();
  await runtime.connect(); runtimeConnected = true;
  for (const actor of Object.keys(orgs)) {
    await success('/organisations/bootstrap', { token: tokens[actor], body: {
      legalName: `Gate 7 OIDC ${actor}`, countryCode: 'NL', role: 'responsible_economic_operator' } });
    models[actor] = await success('/battery-models', { token: tokens[actor], body: {
      modelIdentifier: `oidc-private-${actor}-${randomUUID()}`, category: 'EV' } });
  }
}, { timeout: 180000 });

after(async () => {
  for (const api of children) await stopApi(api);
  if (runtimeConnected) await runtime.end();
  if (issuerServer?.listening) {
    issuerServer.closeAllConnections();
    await new Promise(resolve => issuerServer.close(resolve));
  }
  if (tlsDirectory) {
    const target = resolve(tlsDirectory), insideTemp = relative(resolve(tmpdir()), target);
    if (!insideTemp || insideTemp.startsWith('..') || isAbsolute(insideTemp) || !basename(target).startsWith('eubp-oidc-')) {
      throw new Error('Refusing to remove an unexpected OIDC fixture directory.');
    }
    rmSync(target, { recursive: true, force: true });
  }
});

test('Gate 7 OIDC: production verifies real RS256 signatures through trusted HTTPS JWKS for two tenants', async () => {
  assert.ok(jwksRequests > 0, 'The API must actually fetch the HTTPS issuer key set.');
  for (const actor of Object.keys(orgs)) {
    const organisation = await success('/organisations/current', { token: tokens[actor] });
    assert.equal(organisation.id, orgs[actor]);
    assert.equal(organisation.legalName, `Gate 7 OIDC ${actor}`);
  }
  const audienceList = await sign({ aud: ['another-resource', audience] });
  assert.equal((await success('/organisations/current', { token: audienceList })).id, orgs.A);
});

test('Gate 7 OIDC: signed tenant claims retain HTTP and runtime database isolation', async () => {
  assert.deepEqual((await success('/battery-models', { token: tokens.A })).map(model => model.id), [models.A.id]);
  assert.equal((await request(`/battery-models/${models.B.id}`, { token: tokens.A })).status, 404);
  assert.equal((await request('/battery-items', { token: tokens.A,
    body: { modelId: models.B.id, serialOrItemIdentifier: randomUUID(), organisationId: orgs.B } })).status, 404);
  assert.equal((await request('/organisations/current', { token: tokens.A, acting: orgs.B })).status, 403);
  const { rows: [role] } = await runtime.query('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  assert.equal(role.current_user, 'eubp_runtime'); assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false);
  await runtime.query('BEGIN');
  try {
    await runtime.query("SELECT set_config('app.current_org_id', $1, true)", [orgs.A]);
    assert.equal((await runtime.query('SELECT id FROM "BatteryModel" WHERE id = $1', [models.B.id])).rowCount, 0);
  } finally { await runtime.query('ROLLBACK'); }
});

test('Gate 7 OIDC: absent role defaults to operator_user and retains the existing supported role set', async () => {
  const user = await sign({ role: undefined });
  assert.equal((await success('/organisations/current', { token: user })).id, orgs.A);
  assert.equal((await request('/authorisations', { token: user, body: {} })).status, 403);
  for (const role of ['operator_admin', 'operator_user', 'service_provider', 'compliance_manager', 'service_provider_admin']) {
    assert.equal((await request('/organisations/current', { token: await sign({ role }) })).status, 200, role);
  }
});

test('Gate 7 OIDC: wrong or missing issuer and audience are rejected uniformly', async () => {
  for (const overrides of [{ iss: issuer + '/other' }, { iss: undefined }, { aud: 'different-resource' },
    { aud: ['different-resource'] }, { aud: undefined }]) await denied(await sign(overrides));
});

test('Gate 7 OIDC: expiration, issuance, subject and configured organisation claims are mandatory', async () => {
  for (const required of ['exp', 'iat', 'sub', 'org_id']) await denied(await sign({ [required]: undefined }));
  await denied(await sign({ exp: Math.floor(Date.now() / 1000) - 60 }));
});

test('Gate 7 OIDC: future issuance/not-before and over-age tokens fail beyond the clock tolerance', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const overrides of [{ iat: now + 60 }, { nbf: now + 60 }, { iat: now - 3700, exp: now + 600 },
    { iat: 'yesterday' }, { nbf: 'tomorrow' }, { exp: 'later' }]) await denied(await sign(overrides));
  assert.equal((await request('/organisations/current', { token: await sign({ iat: now + 2, nbf: now + 2 }) })).status, 200);
});

test('Gate 7 OIDC: arrays, objects and empty or malformed identity claims never become tenant strings', async () => {
  for (const sub of ['', '   ', ' oidc-A', 'oidc-A ', [], ['oidc-A'], {}, 7, null]) await denied(await sign({ sub }));
  for (const org_id of ['', 'not-a-uuid', [], [orgs.A], { id: orgs.A }, 7, null]) await denied(await sign({ org_id }));
});

test('Gate 7 OIDC: malformed roles and ambiguous legacy organisation aliases cannot grant access', async () => {
  for (const role of ['', 'operator_admin ', 'superadmin', ['operator_admin'], { role: 'operator_admin' }, 7, null]) {
    await denied(await sign({ role }));
  }
  await denied(await sign({ org_id: undefined, organisation_id: orgs.A }));
  await denied(await sign({ org_id: orgs.A, organisation_id: orgs.B }));
});

test('Gate 7 OIDC: wrong signatures, payload tampering and attacker key URLs are rejected', async () => {
  await denied(await sign({}, { key: unrelatedKey.privateKey }));
  const parts = tokens.A.split('.');
  parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')), org_id: orgs.B })).toString('base64url');
  await denied(parts.join('.'));
  const before = unexpectedRequests;
  await denied(await sign({}, { key: unrelatedKey.privateKey, header: { jku: issuer + '/attacker-jwks', x5u: issuer + '/attacker-cert' } }));
  assert.equal(unexpectedRequests, before, 'Token headers cannot redirect the trusted key source.');
});

test('Gate 7 OIDC: symmetric, unsigned and nonconfigured asymmetric algorithms are rejected', async () => {
  const symmetricKey = new TextEncoder().encode(process.env.DEV_JWT_SECRET);
  await denied(await sign({}, { key: symmetricKey, alg: 'HS256' }));
  await denied(await sign({}, { key: ecKey.privateKey, alg: 'ES256', kid: 'ec-primary' }));
  const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims())).toString('base64url')}.`;
  await denied(unsigned);
});

test('Gate 7 OIDC: unknown keys and malformed or missing bearer credentials return authentication errors', async () => {
  await denied(await sign({}, { kid: 'not-published' }));
  for (const malformed of ['not-a-jwt', 'one.two.three', 'a.b']) await denied(malformed);
  for (const authorization of ['', 'Bearer ', 'Basic credentials']) {
    const response = await request('/organisations/current', { authorization });
    assert.equal(response.status, 401); assert.equal(response.data.code, 'BEARER_REQUIRED');
  }
});

test('Gate 7 OIDC: rotation refreshes real issuer keys and accepts both overlapping signing keys', async () => {
  jwksKeys = [...jwksKeys, await publicJwk(rotatedKey, 'rotated', 'RS256')];
  await pauseForJwksRefresh();
  const before = jwksRequests;
  const token = await sign({}, { key: rotatedKey.privateKey, kid: 'rotated' });
  assert.equal((await success('/organisations/current', { token })).id, orgs.A);
  assert.ok(jwksRequests > before, 'The rotated key must be fetched rather than injected into the API cache.');
  assert.equal((await request('/organisations/current', { token: tokens.A })).status, 200);
});

test('Gate 7 OIDC: unavailable, malformed and redirecting JWKS responses fail closed without HTTP 500', async () => {
  const beforeUnexpected = unexpectedRequests;
  try {
    for (const failure of ['unavailable', 'malformed', 'redirect']) {
      issuerMode = failure;
      await pauseForJwksRefresh();
      const before = jwksRequests;
      await denied(tokens.A);
      assert.ok(jwksRequests > before, `The ${failure} issuer response must be exercised.`);
    }
  } finally { issuerMode = 'normal'; }
  assert.equal(unexpectedRequests, beforeUnexpected, 'JWKS redirects are not followed.');
  assert.equal((await request('/organisations/current', { token: tokens.A })).status, 200);
});

test('Gate 7 OIDC: an untrusted issuer certificate remains rejected with production TLS verification active', { timeout: 90000 }, async () => {
  const untrusted = await startApi({}, { trustFixtureCa: false });
  try { await denied(tokens.A, { api: untrusted }); }
  finally { await stopApi(untrusted); }
});

test('Gate 7 OIDC: explicit organisation and role claim mappings select only the configured claims', { timeout: 90000 }, async () => {
  const mapped = await startApi({ OIDC_ORGANISATION_CLAIM: 'tenant_uuid', OIDC_ROLE_CLAIM: 'access_role' });
  try {
    const token = await sign({ tenant_uuid: orgs.B, access_role: 'operator_user', org_id: orgs.A, role: 'operator_admin' });
    assert.equal((await success('/organisations/current', { token, api: mapped })).id, orgs.B);
    assert.equal((await request('/authorisations', { token, api: mapped, body: {} })).status, 403);
    await denied(tokens.A, { api: mapped });
    await denied(await sign({ tenant_uuid: [orgs.A], access_role: 'operator_user' }), { api: mapped });
    await denied(await sign({ tenant_uuid: orgs.A, access_role: ['operator_admin'] }), { api: mapped });
  } finally { await stopApi(mapped); }
});

test('Gate 7 OIDC: an explicitly selected ES256 profile verifies real EC signatures and rejects RS256', { timeout: 90000 }, async () => {
  const ecApi = await startApi({ OIDC_ALLOWED_ALGORITHMS: 'ES256' });
  try {
    const token = await sign({}, { key: ecKey.privateKey, alg: 'ES256', kid: 'ec-primary' });
    assert.equal((await success('/organisations/current', { token, api: ecApi })).id, orgs.A);
    await denied(tokens.A, { api: ecApi });
  } finally { await stopApi(ecApi); }
});

test('Gate 7 OIDC: production cannot issue or accept development authentication tokens', async () => {
  const issued = await request('/auth/dev-token', { token: null, body: {
    subject: 'no-production-dev-access', organisationId: orgs.A, role: 'operator_admin' } });
  assert.equal(issued.status, 401);
  assert.equal(issued.data.accessToken, undefined);
  const development = await sign({ iss: 'eubatterypassport-dev', aud: 'eubatterypassport-api' }, {
    key: new TextEncoder().encode(process.env.DEV_JWT_SECRET), alg: 'HS256' });
  await denied(development);
  assert.equal((await success('/organisations/current')).id, orgs.A);
});
