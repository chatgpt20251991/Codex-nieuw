const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');

let api, base, logs = '';
let fixture;
const admin = new PrismaClient({ datasources: { db: { url: process.env.TEST_ADMIN_DATABASE_URL } } });
const runtime = new Client({ connectionString: process.env.DATABASE_URL });
const orgs = { A: randomUUID(), B: randomUUID(), S: randomUUID(), T: randomUUID() };
const tokens = {};
async function request(path, actor = 'A', body, acting, method) {
  const headers = { 'content-type': 'application/json' };
  if (actor) headers.authorization = `Bearer ${tokens[actor] || actor}`;
  if (acting) headers['x-acting-organisation-id'] = orgs[acting] || acting;
  const response = await fetch(base + path, { method: method || (body === undefined ? 'GET' : 'POST'),
    headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  return { status: response.status, data };
}
async function success(path, actor, body, acting) {
  const result = await request(path, actor, body, acting);
  assert.ok([200, 201].includes(result.status), `${path}: ${JSON.stringify(result)}`);
  return result.data;
}
async function tenantQuery(tenant, sql, parameters = []) {
  await runtime.query('BEGIN');
  try {
    await runtime.query("SELECT set_config('app.current_org_id', $1, true)", [orgs[tenant]]);
    return await runtime.query(sql, parameters);
  } finally { await runtime.query('ROLLBACK'); }
}

before(async () => {
  const { SignJWT } = await import('jose');
  for (const [actor, organisationId] of Object.entries(orgs)) {
    tokens[actor] = await new SignJWT({ org_id: organisationId, role: 'operator_admin' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(`integration-${actor}`)
      .setIssuer('eubatterypassport-dev').setAudience('eubatterypassport-api')
      .setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.DEV_JWT_SECRET));
  }
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}/v1`;
  const apiEnv = { ...process.env, PORT: String(port) };
  // The API is a normal child service, not a nested Node test-runner worker.
  delete apiEnv.NODE_TEST_CONTEXT;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: resolve(__dirname, '../..'),
    env: apiEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  api.stdout.on('data', bytes => { logs = (logs + bytes).slice(-20000); });
  api.stderr.on('data', bytes => { logs = (logs + bytes).slice(-20000); });
  let ready = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    if (api.exitCode !== null) throw new Error(`API exited: ${logs}`);
    try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `API did not start: ${logs}`);
  await runtime.connect();
  for (const name of Object.keys(orgs)) {
    await success('/organisations/bootstrap', name, { legalName: `Integration ${name}`, countryCode: 'NL',
      role: name === 'S' ? 'service_provider' : 'responsible_economic_operator' });
  }
  fixture = {};
  for (const name of ['A', 'B']) {
    const model = await success('/battery-models', name, { modelIdentifier: `secret-model-${name}`, category: 'EV' });
    const item = await success('/battery-items', name, { modelId: model.id, serialOrItemIdentifier: `serial-${name}` });
    const value = await success('/passport-values', name, { modelId: model.id, fieldDefinitionId: 45, value: `restricted-${name}` });
    const supplier = await success('/suppliers', name, { legalName: `Supplier ${name}`, contact: { email: `private-${name}@example.invalid` } });
    const evidence = await admin.evidenceObject.create({ data: { organisationId: orgs[name],
      objectKey: `fixture/${name}/written-authorisation.pdf`, evidenceType: 'written_authorisation',
      sha256: 'a'.repeat(64), verificationStatus: 'verified' } });
    await admin.evidenceLink.create({ data: { evidenceId: evidence.id, passportValueId: value.id } });
    fixture[name] = { model, item, value, supplier, evidence };
  }
}, { timeout: 120000 });

after(async () => {
  await admin.$disconnect();
  await runtime.end();
  if (api && api.exitCode === null) {
    const stopped = once(api, 'exit');
    api.kill();
    await stopped;
  }
});

test('runtime is not an owner, superuser, role administrator or RLS bypass role', async () => {
  const { rows: [role] } = await runtime.query('SELECT current_user, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = current_user');
  assert.equal(role.current_user, 'eubp_runtime');
  assert.equal(role.rolsuper, false);
  assert.equal(role.rolbypassrls, false);
  assert.equal(role.rolcreaterole, false);
  const { rows } = await runtime.query("SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public'");
  assert.ok(rows.length >= 29);
  assert.ok(rows.every(table => table.tableowner === 'eubp_migrator'));
  await assert.rejects(runtime.query('SET ROLE eubp_migrator'), { code: '42501' });
  await assert.rejects(runtime.query('SET ROLE eubp_resolver'), { code: '42501' });
  await assert.rejects(runtime.query('SELECT * FROM "_prisma_migrations"'), { code: '42501' });
  await assert.rejects(runtime.query('CREATE TABLE public.forbidden_table (id int)'), { code: '42501' });
});

test('all tenant-owned and relationship tables force RLS; absent context reveals no rows', async () => {
  const { rows } = await runtime.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN ('RegulatoryRuleSet','FieldDefinition','_prisma_migrations')`);
  assert.equal(rows.length, 27);
  for (const table of rows) {
    assert.equal(table.relrowsecurity, true, table.relname);
    assert.equal(table.relforcerowsecurity, true, table.relname);
    const result = await runtime.query(`SELECT * FROM "${table.relname}"`);
    assert.equal(result.rowCount, 0, table.relname);
  }
});

test('direct SQL hides other tenants, rejects foreign inserts and clears transaction context', async () => {
  const read = await tenantQuery('A', 'SELECT id FROM "BatteryModel" WHERE id=$1', [fixture.B.model.id]);
  assert.equal(read.rowCount, 0);
  await assert.rejects(tenantQuery('A', `INSERT INTO "BatteryModel" (id,"organisationId","modelIdentifier",category,"updatedAt")
    VALUES ($1,$2,'foreign-write','EV',now())`, [randomUUID(), orgs.B]), { code: '42501' });
  assert.equal((await runtime.query('SELECT id FROM "BatteryModel"')).rowCount, 0);
  assert.equal((await tenantQuery('A', 'SELECT id FROM "BatteryModel"')).rows[0].id, fixture.A.model.id);
});

test('relationship rows inherit tenant isolation and cannot join evidence across tenants', async () => {
  const contacts = await tenantQuery('A', 'SELECT email FROM "SupplierContact"');
  assert.deepEqual(contacts.rows.map(x => x.email), ['private-A@example.invalid']);
  const links = await tenantQuery('A', 'SELECT * FROM "EvidenceLink"');
  assert.deepEqual(links.rows.map(x => x.passportValueId), [fixture.A.value.id]);
  await assert.rejects(tenantQuery('A', 'INSERT INTO "EvidenceLink" ("evidenceId","passportValueId") VALUES ($1,$2)',
    [fixture.A.evidence.id, fixture.B.value.id]), { code: '42501' });
});

test('missing and invalid bearer tokens return 401', async () => {
  assert.equal((await request('/battery-models', null)).status, 401);
  assert.equal((await request('/battery-models', 'invalid.token')).status, 401);
});

test('direct model, item and value routes hide another tenant and ignore tenant IDs in request bodies', async () => {
  for (const [path, object] of [['battery-models', fixture.B.model], ['battery-items', fixture.B.item], ['passport-values', fixture.B.value]]) {
    const result = await request(`/${path}/${object.id}`, 'A');
    assert.equal(result.status, 404);
    assert.equal(result.data.code, 'RESOURCE_NOT_FOUND');
  }
  const created = await success('/battery-models', 'A', { modelIdentifier: 'body-spoof', category: 'EV', organisationId: orgs.B });
  assert.equal(created.organisationId, orgs.A);
  const emptyValue = await success('/passport-values', 'A', { modelId: fixture.A.model.id, fieldDefinitionId: 9, value: null });
  assert.equal(emptyValue.valueJson, null);
  assert.equal(emptyValue.validationStatus, 'unvalidated');
  assert.equal((await request('/battery-items', 'A', { modelId: fixture.B.model.id, serialOrItemIdentifier: 'forbidden' })).status, 404);
  assert.equal((await request('/passport-values', 'A', { modelId: fixture.B.model.id, fieldDefinitionId: 11, value: 99 })).status, 404);
  assert.equal((await request(`/passport-values/${fixture.B.value.id}/reject`, 'A', { reason: 'forbidden' })).status, 404);
  const untouched = await admin.passportValue.findUniqueOrThrow({ where: { id: fixture.B.value.id } });
  assert.equal(untouched.validationStatus, 'unvalidated');
});

test('concurrent API requests retain their own tenant', async () => {
  await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const actor = index % 2 ? 'A' : 'B';
    const models = await success('/battery-models', actor);
    assert.ok(models.length > 0);
    assert.ok(models.every(model => model.organisationId === orgs[actor]));
  }));
});

test('delegation requires verified evidence; active grant enables only its customer and cannot be re-delegated', async () => {
  assert.equal((await request('/battery-models', 'S', undefined, 'A')).status, 403);
  const pending = await admin.evidenceObject.create({ data: { organisationId: orgs.A,
    objectKey: 'fixture/pending-authorisation', evidenceType: 'written_authorisation', sha256: 'b'.repeat(64) } });
  assert.equal((await request('/authorisations', 'A', { serviceProviderId: orgs.S, evidenceId: pending.id, scope: {} })).status, 409);
  fixture.authorisation = await success('/authorisations', 'A', { serviceProviderId: orgs.S,
    evidenceId: fixture.A.evidence.id, scope: { passportManagement: true } });
  const model = await success(`/battery-models/${fixture.A.model.id}`, 'S', undefined, 'A');
  assert.equal(model.organisationId, orgs.A);
  const value = await success('/passport-values', 'S', { modelId: fixture.A.model.id, fieldDefinitionId: 11, value: 74 }, 'A');
  assert.equal(value.organisationId, orgs.A);
  assert.equal((await request(`/battery-models/${fixture.B.model.id}`, 'S', undefined, 'A')).status, 404);
  assert.equal((await request('/battery-models', 'S', undefined, 'B')).status, 403);
  assert.equal((await request('/battery-models', 'B', undefined, 'A')).status, 403);
  assert.equal((await request('/authorisations', 'S', { serviceProviderId: orgs.T,
    evidenceId: fixture.A.evidence.id, scope: {} }, 'A')).status, 403);
});

test('revocation takes effect on the next request with the same token and creates an audit event', async () => {
  assert.equal((await request(`/authorisations/${fixture.authorisation.id}/revoke`, 'B', {})).status, 404);
  await success(`/authorisations/${fixture.authorisation.id}/revoke`, 'A', {});
  assert.equal((await request('/battery-models', 'S', undefined, 'A')).status, 403);
  assert.equal((await request('/passport-values', 'S', { modelId: fixture.A.model.id, fieldDefinitionId: 12, value: 'NMC' }, 'A')).status, 403);
  const events = await admin.auditEvent.findMany({ where: { resourceId: fixture.authorisation.id }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(events.map(e => e.action), ['authorisation.create', 'authorisation.revoke']);
  assert.ok(events.every(e => e.organisationId === orgs.A));
});

test('expired and not-yet-effective authorisations deny access immediately', async () => {
  const auth = await success('/authorisations', 'A', { serviceProviderId: orgs.S,
    evidenceId: fixture.A.evidence.id, scope: {}, validFrom: new Date(Date.now() - 60000).toISOString(),
    validUntil: new Date(Date.now() + 60000).toISOString() });
  assert.equal((await request('/battery-models', 'S', undefined, 'A')).status, 200);
  await admin.writtenAuthorisation.update({ where: { id: auth.id }, data: { validUntil: new Date(Date.now() - 1) } });
  assert.equal((await request('/battery-models', 'S', undefined, 'A')).status, 403);
  await admin.writtenAuthorisation.update({ where: { id: auth.id }, data: { validFrom: new Date(Date.now() + 60000), validUntil: null } });
  assert.equal((await request('/battery-models', 'S', undefined, 'A')).status, 403);
});

test('non-login public resolver works under FORCE RLS and exposes only the public projection', async () => {
  const version = await admin.passportVersion.create({ data: { organisationId: orgs.A, batteryItemId: fixture.A.item.id,
    versionNo: 1, canonicalJson: { values: [{ fieldId: 50, value: 'authority-secret' }] }, sha256: 'c'.repeat(64),
    ruleSetVersion: 'integration-fixture', publicationState: 'published' } });
  await admin.publicPassportSnapshot.create({ data: { organisationId: orgs.A, batteryItemId: fixture.A.item.id,
    passportVersionId: version.id, publicId: fixture.A.item.publicId, upi: `https://example.invalid/b/${fixture.A.item.publicId}`,
    publicJson: { values: [{ fieldId: 3, value: 'Public manufacturer' }] }, sha256: 'd'.repeat(64) } });
  const result = await request(`/public/b/${fixture.A.item.publicId}`, null);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { values: [{ fieldId: 3, value: 'Public manufacturer' }] });
  const { rows: [resolver] } = await runtime.query("SELECT rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname='eubp_resolver'");
  assert.deepEqual(resolver, { rolcanlogin: false, rolbypassrls: false, rolsuper: false });
});

test('supplier acceptance preserves JSON null without validating it', async () => {
  const invite = await success('/supplier-requests', 'A', { supplierId: fixture.A.supplier.id,
    modelId: fixture.A.model.id, fieldDefinitionIds: [10] });
  const token = new URLSearchParams(new URL(invite.inviteUrl).hash.slice(1)).get('token');
  const headers = { 'content-type': 'application/json', 'x-supplier-token': token };
  const session = await fetch(base + '/supplier-portal/session', { headers });
  assert.equal(session.status, 200);
  assert.deepEqual((await session.json()).requestedFields.map(field => field.fieldDefinitionId), [10]);
  const submitted = await fetch(base + '/supplier-portal/submissions', { method: 'POST', headers,
    body: JSON.stringify({ submissions: [{ fieldDefinitionId: 10, value: null }] }) });
  assert.equal(submitted.status, 201);
  const result = await success(`/supplier-requests/${invite.request.id}/accept`, 'A', {});
  assert.equal(result.acceptedValues, 1);
  const value = await admin.passportValue.findFirstOrThrow({ where: { organisationId: orgs.A,
    fieldDefinitionId: 10, validUntil: null } });
  assert.equal(value.valueJson, null);
  assert.equal(value.validationStatus, 'submitted');
});

test('restricted token resolver honours the granted tier and expiry under FORCE RLS', async () => {
  const grant = await success('/access-grants', 'A', { batteryItemId: fixture.A.item.id,
    granteeSubject: 'integration-recycler', granteeRole: 'recycler', accessTier: 'legitimate_interest_model',
    purpose: 'Integration fixture inspection' });
  const token = new URLSearchParams(new URL(grant.accessUrl).hash.slice(1)).get('token');
  const headers = { 'x-passport-access-token': token };
  const allowed = await fetch(base + '/restricted-access/session', { method: 'POST', headers });
  assert.equal(allowed.status, 201);
  const passport = await allowed.json();
  assert.deepEqual(passport.values, []); // The fixture contains only authority-only field 50.
  assert.ok(!JSON.stringify(passport).includes('authority-secret'));
  await admin.accessGrant.update({ where: { id: grant.grant.id }, data: { validUntil: new Date(Date.now() - 1) } });
  const expired = await fetch(base + '/restricted-access/session', { method: 'POST', headers });
  assert.equal(expired.status, 410);
});

test('runtime cannot alter another operator authorisation or rewrite audit history', async () => {
  const updated = await tenantQuery('S', 'UPDATE "WrittenAuthorisation" SET "revokedAt" = NULL WHERE id=$1', [fixture.authorisation.id]);
  assert.equal(updated.rowCount, 0);
  await assert.rejects(tenantQuery('S', `INSERT INTO "WrittenAuthorisation"
    (id,"responsibleOperatorId","serviceProviderId","scopeJson","documentObjectKey","documentSha256","validFrom")
    VALUES ($1,$2,$3,'{}','forged','forged',now())`, [randomUUID(), orgs.A, orgs.S]), { code: '42501' });
  await assert.rejects(tenantQuery('A', 'UPDATE "AuditEvent" SET action=\'forged\''), { code: '42501' });
});
