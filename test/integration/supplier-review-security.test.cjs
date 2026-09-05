const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const admin = new PrismaClient({ datasources: { db: { url: process.env.TEST_ADMIN_DATABASE_URL } } });
const orgs = { A: randomUUID(), B: randomUUID() }, tokens = {};
let api, base, logs = '', supplier;

async function request(path, { actor = 'A', supplierToken, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (actor) headers.authorization = `Bearer ${tokens[actor]}`;
  if (supplierToken) headers['x-supplier-token'] = supplierToken;
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: response.status, data: await response.json() };
}
async function success(path, options) {
  const response = await request(path, options);
  assert.ok([200, 201].includes(response.status), `${path}: ${JSON.stringify(response)}`);
  return response.data;
}
const submit = (fixture, fieldDefinitionId = 26) => request('/supplier-portal/submissions', {
  actor: null, supplierToken: fixture.token, body: { submissions: [{ fieldDefinitionId, value: 100 }] },
});
const accept = (fixture, actor = 'A') => request(`/supplier-requests/${fixture.request.id}/accept`, { actor, body: {} });
const session = fixture => request('/supplier-portal/session', { actor: null, supplierToken: fixture.token });

async function fixture() {
  const model = await success('/battery-models', { body: { modelIdentifier: randomUUID(), category: 'EV' } });
  const invitation = await success('/supplier-requests', { body: { supplierId: supplier.id,
    modelId: model.id, fieldDefinitionIds: [11, 26] } });
  const output = { model, request: invitation.request,
    token: new URLSearchParams(new URL(invitation.inviteUrl).hash.slice(1)).get('token') };
  assert.equal((await submit(output, 11)).status, 201);
  return output;
}
async function state(fixture) {
  return { request: await admin.supplierRequest.findUniqueOrThrow({ where: { id: fixture.request.id } }),
    submissions: await admin.supplierSubmission.findMany({ where: { supplierRequestId: fixture.request.id }, orderBy: { id: 'asc' } }),
    values: await admin.passportValue.findMany({ where: { modelId: fixture.model.id }, orderBy: { id: 'asc' } }),
    audits: await admin.auditEvent.findMany({ where: { organisationId: orgs.A,
      action: 'supplier_request.accept', resourceId: fixture.request.id }, orderBy: { id: 'asc' } }) };
}

before(async () => {
  const { SignJWT } = await import('jose');
  for (const actor of Object.keys(orgs)) tokens[actor] = await new SignJWT({ org_id: orgs[actor], role: 'operator_admin' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(`supplier-review-${actor}`).setIssuer('eubatterypassport-dev')
    .setAudience('eubatterypassport-api').setIssuedAt().setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.DEV_JWT_SECRET));
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
    if (api.exitCode !== null || api.signalCode !== null) throw new Error(logs);
    try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  for (const actor of Object.keys(orgs)) await success('/organisations/bootstrap', { actor,
    body: { legalName: `Supplier review ${actor}`, countryCode: 'NL', role: 'responsible_economic_operator' } });
  supplier = await success('/suppliers', { body: { legalName: 'Synthetic supplier review fixture' } });
}, { timeout: 120000 });

after(async () => {
  if (api && api.exitCode === null && api.signalCode === null) { const stopped = once(api, 'exit'); api.kill(); await stopped; }
  await admin.$disconnect();
});

test('Gate 7 supplier review: concurrent acceptance commits once and refuses another tenant or a repeat', async () => {
  const current = await fixture();
  assert.equal((await accept(current, 'B')).status, 404);
  const responses = await Promise.all([accept(current), accept(current)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 410]);
  assert.equal(responses.find(response => response.status === 201).data.acceptedValues, 1);
  const stored = await state(current);
  assert.equal(stored.request.status, 'accepted'); assert.equal(stored.audits.length, 1);
  assert.equal(stored.values.length, 1); assert.equal(stored.values[0].validationStatus, 'submitted');
  assert.equal((await accept(current)).status, 410);
  assert.deepEqual(await state(current), stored);
});

test('Gate 7 supplier review: accepted, cancelled and expired requests reject later submissions without writes', async () => {
  for (const closure of ['accepted', 'cancelled', 'expired', 'past_expiry']) {
    const current = await fixture();
    if (closure === 'accepted') assert.equal((await accept(current)).status, 201);
    else await admin.supplierRequest.update({ where: { id: current.request.id },
      data: closure === 'past_expiry' ? { expiresAt: new Date(Date.now() - 60000) } : { status: closure } });
    const stored = await state(current);
    assert.equal((await submit(current)).status, 410, closure);
    assert.equal((await session(current)).status, 410, closure);
    assert.equal((await accept(current)).status, 410, closure);
    assert.deepEqual(await state(current), stored);
  }
});

test('Gate 7 supplier review: acceptance and supplier submission serialize without losing acknowledged values', async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fixture();
    const submission = submit(current), acceptance = accept(current);
    const [submitted, accepted] = await Promise.all([submission, acceptance]);
    assert.ok([201, 410].includes(submitted.status), JSON.stringify(submitted));
    assert.equal(accepted.status, 201, JSON.stringify(accepted));
    const count = submitted.status === 201 ? 2 : 1;
    assert.equal(accepted.data.acceptedValues, count);
    const stored = await state(current);
    assert.equal(stored.request.status, 'accepted'); assert.equal(stored.audits.length, 1);
    assert.equal(stored.submissions.length, count); assert.equal(stored.values.length, count);
    assert.deepEqual(stored.values.map(value => value.fieldDefinitionId).sort((a, b) => a - b), count === 2 ? [11, 26] : [11]);
    assert.ok(stored.values.every(value => value.validationStatus === 'submitted'));
  }
});

test('Gate 7 supplier review: opening the portal preserves submitted status and cannot reopen accepted requests', async () => {
  const submitted = await fixture();
  assert.equal((await session(submitted)).status, 200);
  const opened = await state(submitted);
  assert.equal(opened.request.status, 'submitted'); assert.ok(opened.request.openedAt);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fixture();
    const [accepted, portal] = await Promise.all([accept(current), session(current)]);
    assert.equal(accepted.status, 201, JSON.stringify(accepted));
    assert.ok([200, 410].includes(portal.status), JSON.stringify(portal));
    assert.equal((await state(current)).request.status, 'accepted');
    assert.equal((await session(current)).status, 410);
  }
});

test('Gate 7 supplier review: audit failure rolls back accepted values and request closure atomically', async () => {
  const current = await fixture(), before = await state(current);
  const name = `supplier_audit_failure_${randomBytes(8).toString('hex')}`;
  // This additional test-only trigger rejects one synthetic request's audit.
  // Existing audit/version protections remain active throughout the exercise.
  await admin.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'supplier_request.accept' AND NEW."resourceId" = '${current.request.id}' THEN
        RAISE EXCEPTION 'Synthetic supplier audit failure' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$`);
  let triggerCreated = false;
  try {
    await admin.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
    triggerCreated = true;
    assert.equal((await accept(current)).status, 500);
    assert.deepEqual(await state(current), before);
  } finally {
    if (triggerCreated) await admin.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "AuditEvent"`);
    await admin.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
  }
  assert.equal((await accept(current)).status, 201);
  const stored = await state(current);
  assert.equal(stored.request.status, 'accepted'); assert.equal(stored.values.length, 1); assert.equal(stored.audits.length, 1);
});
