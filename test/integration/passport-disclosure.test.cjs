const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { fields } = require('@eubp/rules');

const admin = new PrismaClient({ datasources: { db: { url: process.env.TEST_ADMIN_DATABASE_URL } } });
const orgs = { A: randomUUID(), B: randomUUID() }, tokens = {};
let api, base, logs = '', fixture;
async function request(path, { actor = 'A', body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (actor) headers.authorization = `Bearer ${tokens[actor]}`;
  if (token) headers['x-passport-access-token'] = token;
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { status: response.status, data: await response.json() };
}
async function success(path, options) {
  const result = await request(path, options);
  assert.ok([200, 201].includes(result.status), `${path}: ${JSON.stringify(result)}`);
  return result.data;
}
async function grant(tier, itemId = fixture.item.id) {
  const response = await success('/access-grants', { body: { batteryItemId: itemId,
    granteeSubject: 'gate3-recipient', granteeRole: 'recycler', accessTier: tier,
    purpose: 'Gate 3 disclosure regression' } });
  return { id: response.grant.id, token: new URLSearchParams(new URL(response.accessUrl).hash.slice(1)).get('token') };
}
const readGrant = token => request('/restricted-access/session', { actor: null, token, body: {} });
const ids = passport => passport.values.map(value => value.fieldId);
const allowedIds = tier => fields.filter(field => field.access_tier === 'public' || field.access_tier === tier).map(field => field.id);
function noInternalMetadata(passport) {
  const serialized = JSON.stringify(passport);
  for (const key of ['evidenceIds', 'sourceKind', 'validationStatus', 'tokenHash', 'organisationId', 'privateMetadata']) {
    assert.ok(!serialized.includes(`"${key}"`), key);
  }
  assert.equal(passport.battery.id, undefined);
  assert.equal(passport.battery.modelId, undefined);
}

before(async () => {
  const { SignJWT } = await import('jose');
  for (const [name, id] of Object.entries(orgs)) {
    tokens[name] = await new SignJWT({ org_id: id, role: 'operator_admin' }).setProtectedHeader({ alg: 'HS256' })
      .setSubject(`gate3-${name}`).setIssuer('eubatterypassport-dev').setAudience('eubatterypassport-api')
      .setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.DEV_JWT_SECRET));
  }
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}/v1`;
  const env = { ...process.env, PORT: String(port) }; delete env.NODE_TEST_CONTEXT;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: resolve(__dirname, '../..'), env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  api.stdout.on('data', bytes => { logs = (logs + bytes).slice(-20000); });
  api.stderr.on('data', bytes => { logs = (logs + bytes).slice(-20000); });
  let ready = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    if (api.exitCode !== null) throw new Error(`API exited: ${logs}`);
    try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `API did not start: ${logs}`);
  for (const actor of Object.keys(orgs)) await success('/organisations/bootstrap', { actor,
    body: { legalName: `Gate 3 ${actor}`, countryCode: 'NL', role: 'responsible_economic_operator' } });
  const model = await success('/battery-models', { body: { modelIdentifier: 'gate3-model', category: 'EV' } });
  const item = await success('/battery-items', { body: { modelId: model.id, serialOrItemIdentifier: 'gate3-item' } });
  // Gate 3 starts with verified evidence fixtures. Object storage/upload integrity is Gate 4.
  const evidence = await admin.evidenceObject.create({ data: { organisationId: orgs.A,
    objectKey: 'gate3/verified-report', evidenceType: 'test_report', sha256: 'e'.repeat(64), verificationStatus: 'verified' } });
  for (const field of fields) {
    const value = await success('/passport-values', { body: { batteryItemId: item.id, fieldDefinitionId: field.id,
      value: [10, 11, 26, 27, 28, 51].includes(field.id) ? 100 : `gate3-field-${field.id}` } });
    await success('/evidence/link', { body: { evidenceId: evidence.id, passportValueId: value.id } });
    await success(`/passport-values/${value.id}/validate`, { body: {} });
  }
  const validation = await success(`/passports/${item.id}/validate`, { body: {} });
  assert.equal(validation.publishable, true);
  const published = await success(`/passports/${item.id}/publish`, { body: {} });
  assert.equal(published.version.canonicalJson.values.length, 71);
  fixture = { model, item, evidence, published };
}, { timeout: 120000 });

after(async () => {
  await admin.$disconnect();
  if (api && api.exitCode === null) { const stopped = once(api, 'exit'); api.kill(); await stopped; }
});

test('Gate 3: real publication stores and resolves only public fields and metadata', async () => {
  const passport = await success(`/public/b/${fixture.item.publicId}`, { actor: null });
  assert.deepEqual(ids(passport), allowedIds());
  assert.equal(passport.battery.lifecycleStatus, undefined);
  noInternalMetadata(passport);
  const snapshot = await admin.publicPassportSnapshot.findFirstOrThrow({ where: { passportVersionId: fixture.published.version.id } });
  assert.deepEqual(snapshot.publicJson, passport);
  const { canonicalize } = require('../../apps/api/dist/common/crypto/canonical.js');
  assert.equal(snapshot.sha256, createHash('sha256').update(canonicalize(passport)).digest('hex'));
  assert.equal((await success(`/battery-items/${fixture.item.id}`)).passportState, 'published');
  const response = await fetch(`${base}/public/b/${fixture.item.publicId}/qr.svg`);
  assert.equal(response.status, 200); assert.match(await response.text(), /<svg/);
});

for (const tier of ['legitimate_interest_model', 'legitimate_interest_item']) {
  test(`Gate 3: ${tier} exposes exactly its own tier plus public fields`, async () => {
    const capability = await grant(tier);
    const response = await readGrant(capability.token);
    assert.equal(response.status, 201);
    assert.deepEqual(ids(response.data), allowedIds(tier));
    assert.ok(!JSON.stringify(response.data).includes('gate3-field-50'));
    if (tier === 'legitimate_interest_model') assert.equal(response.data.battery.lifecycleStatus, undefined);
    noInternalMetadata(response.data);
    const stored = await admin.accessGrant.findUniqueOrThrow({ where: { id: capability.id } });
    assert.equal(stored.tokenHash, createHash('sha256').update(capability.token).digest('hex'));
    const events = await admin.auditEvent.findMany({ where: { resourceId: fixture.published.version.id, action: 'passport.restricted_read' } });
    assert.ok(events.some(event => event.metadata.tier === tier));
  });
}

test('Gate 3: missing and unknown capability tokens fail, and authority-only grants cannot be issued', async () => {
  assert.equal((await readGrant()).status, 401);
  assert.equal((await readGrant('unknown-capability')).status, 401);
  const invalid = await request('/access-grants', { body: { batteryItemId: fixture.item.id,
    granteeSubject: 'authority', granteeRole: 'market_surveillance_authority', accessTier: 'authority_only', purpose: 'No role spoofing' } });
  assert.equal(invalid.status, 400);
});

test('Gate 3: expiry, future activation and revocation deny the same token immediately', async () => {
  const expired = await grant('legitimate_interest_model');
  assert.equal((await readGrant(expired.token)).status, 201);
  await admin.accessGrant.update({ where: { id: expired.id }, data: { validUntil: new Date(Date.now() - 1000) } });
  assert.equal((await readGrant(expired.token)).status, 410);
  const future = await grant('legitimate_interest_model');
  await admin.accessGrant.update({ where: { id: future.id }, data: { validFrom: new Date(Date.now() + 60000) } });
  assert.equal((await readGrant(future.token)).status, 410);
  const revoked = await grant('legitimate_interest_item');
  assert.equal((await request(`/access-grants/${revoked.id}/revoke`, { actor: 'B', body: {} })).status, 404);
  assert.equal((await readGrant(revoked.token)).status, 201);
  await success(`/access-grants/${revoked.id}/revoke`, { body: {} });
  assert.equal((await readGrant(revoked.token)).status, 410);
  await success(`/access-grants/${revoked.id}/revoke`, { body: {} });
  const events = await admin.auditEvent.findMany({ where: { resourceId: revoked.id } });
  assert.deepEqual(events.map(event => event.action).sort(), ['access_grant.create', 'access_grant.revoke']);
});

test('Gate 3: malformed stored grants never expand to another item or authority-only access', async () => {
  for (const change of [{ batteryItemId: null }, { accessTier: 'authority_only' }, { accessTier: 'unknown' }, { validUntil: null }]) {
    const capability = await grant('legitimate_interest_model');
    await admin.accessGrant.update({ where: { id: capability.id }, data: change });
    const result = await readGrant(capability.token);
    assert.equal(result.status, 410, JSON.stringify(change));
    assert.ok(!JSON.stringify(result.data).includes('gate3-field-50'));
  }
});

test('Gate 3: a grant cannot select a different item or tenant or expose an unpublished draft', async () => {
  const otherItem = await success('/battery-items', { body: { modelId: fixture.model.id, serialOrItemIdentifier: 'unpublished' } });
  const capability = await grant('legitimate_interest_item', otherItem.id);
  assert.equal((await readGrant(capability.token)).status, 409);
  assert.equal((await request(`/public/b/${otherItem.publicId}`, { actor: null })).status, 404);
  assert.equal((await request('/access-grants', { actor: 'B', body: { batteryItemId: fixture.item.id,
    granteeSubject: 'intruder', granteeRole: 'recycler', accessTier: 'legitimate_interest_item', purpose: 'Wrong tenant' } })).status, 404);
  const valid = await grant('legitimate_interest_model');
  const spoof = await success('/restricted-access/session', { actor: 'B', token: valid.token,
    body: { batteryItemId: otherItem.id, organisationId: orgs.B, accessTier: 'authority_only' } });
  assert.equal(spoof.battery.publicId, fixture.item.publicId);
  assert.deepEqual(ids(spoof), allowedIds('legitimate_interest_model'));
});

test('Gate 3: legacy snapshot metadata and unknown stored tiers cannot bypass projection', async () => {
  const model = await success('/battery-models', { body: { modelIdentifier: 'legacy-model', category: 'EV' } });
  const item = await success('/battery-items', { body: { modelId: model.id, serialOrItemIdentifier: 'legacy-item' } });
  // A legacy publisher persisted unrestricted metadata. Readers must also enforce their output contract.
  const legacy = { ...fixture.published.version.canonicalJson,
    privateMetadata: { authorityReport: 'legacy-authority-secret' },
    battery: { ...fixture.published.version.canonicalJson.battery, publicId: item.publicId },
    values: [
      { fieldId: 3, value: 'legacy-public', evidenceIds: ['private-evidence'], accessTier: 'authority_only' },
      { fieldId: 50, value: 'legacy-authority-secret', accessTier: 'public' },
      { fieldId: 999, value: 'legacy-unknown-secret', accessTier: 'public' },
    ] };
  const version = await admin.passportVersion.create({ data: { organisationId: orgs.A, batteryItemId: item.id,
    versionNo: 1, canonicalJson: legacy, sha256: 'f'.repeat(64), ruleSetVersion: 'legacy-fixture', publicationState: 'published' } });
  await admin.publicPassportSnapshot.create({ data: { organisationId: orgs.A, batteryItemId: item.id,
    passportVersionId: version.id, publicId: item.publicId, upi: `https://example.invalid/${item.publicId}`,
    publicJson: legacy, sha256: 'f'.repeat(64) } });
  const publicView = await success(`/public/b/${item.publicId}`, { actor: null });
  const capability = await grant('legitimate_interest_model', item.id);
  const restricted = await readGrant(capability.token);
  assert.equal(restricted.status, 201);
  for (const passport of [publicView, restricted.data]) {
    assert.deepEqual(ids(passport), [3]);
    assert.equal(passport.battery.lifecycleStatus, undefined);
    assert.ok(!JSON.stringify(passport).includes('legacy-authority-secret'));
    assert.ok(!JSON.stringify(passport).includes('legacy-unknown-secret'));
    noInternalMetadata(passport);
  }
});
