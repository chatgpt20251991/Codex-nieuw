const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { fields } = require('@eubp/rules');
const { hashJson } = require('../../apps/api/dist/common/crypto/canonical.js');
const { S3Client, CreateBucketCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');

const endpoint = new URL(process.env.TEST_S3_ENDPOINT || 'http://127.0.0.1:59000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.pathname !== '/') {
  throw new Error('Gate 5 requires the dedicated local MinIO integration fixture.');
}
const bucket = `eubp-lifecycle-${randomBytes(10).toString('hex')}`;
const s3 = new S3Client({ endpoint: endpoint.href, forcePathStyle: true, region: 'eu-central-1',
  credentials: { accessKeyId: 'eubp-integration', secretAccessKey: 'eubp-integration-secret' } });
const admin = new PrismaClient({ datasources: { db: { url: process.env.TEST_ADMIN_DATABASE_URL } } });
const runtime = new Client({ connectionString: process.env.DATABASE_URL });
const orgs = { A: randomUUID(), B: randomUUID() }, tokens = {}, models = {}, evidence = {};
let api, base, logs = '', bucketCreated = false, runtimeConnected = false, v1, v2, mainItem, v1Stored;

async function request(path, { actor = 'A', body } = {}) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${tokens[actor]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: response.status, data: await response.json() };
}
async function success(path, options) {
  const response = await request(path, options);
  assert.ok([200, 201].includes(response.status), `${path}: ${JSON.stringify(response)}`);
  return response.data;
}
async function value(owner, fieldDefinitionId, data, actor = 'A', verify = true) {
  const row = await success('/passport-values', { actor, body: { ...owner, fieldDefinitionId, value: data } });
  if (verify) {
    await success('/evidence/link', { actor, body: { evidenceId: evidence[actor].evidenceId, passportValueId: row.id } });
    await success(`/passport-values/${row.id}/validate`, { actor, body: {} });
  }
  return row;
}
async function populateModel(actor, model) {
  for (const field of fields.filter(f => ['mandatory', 'mandatory_dynamic'].includes(f.applicability_2027_02_18.EV))) {
    const data = field.id === 67 ? 'original' : [10, 11, 26, 27, 28, 51].includes(field.id) ? 100 : `fixture-${field.id}`;
    await value({ modelId: model.id }, field.id, data, actor);
  }
}
async function makeItem(actor = 'A', model = models[actor]) {
  return success('/battery-items', { actor, body: { modelId: model.id, serialOrItemIdentifier: randomUUID() } });
}
async function publishNew(actor = 'A') {
  const item = await makeItem(actor);
  const validation = await success(`/passports/${item.id}/validate`, { actor, body: {} });
  assert.equal(validation.publishable, true);
  const published = await success(`/passports/${item.id}/publish`, { actor, body: {} });
  return { item, published };
}
const event = (item, eventType, extra = {}, actor = 'A') => request(`/lifecycle/${item.id}/events`, {
  actor, body: { eventType, eventTime: new Date().toISOString(), ...extra },
});
async function runtimeQuery(sql, parameters) {
  await runtime.query('BEGIN');
  try {
    await runtime.query("SELECT set_config('app.current_org_id', $1, true)", [orgs.A]);
    return await runtime.query(sql, parameters);
  } finally { await runtime.query('ROLLBACK'); }
}

before(async () => {
  await s3.send(new CreateBucketCommand({ Bucket: bucket })); bucketCreated = true;
  await runtime.connect(); runtimeConnected = true;
  const { SignJWT } = await import('jose');
  for (const actor of ['A', 'B']) tokens[actor] = await new SignJWT({ org_id: orgs[actor], role: 'operator_admin' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(`gate5-${actor}`).setIssuer('eubatterypassport-dev')
    .setAudience('eubatterypassport-api').setIssuedAt().setExpirationTime('20m')
    .sign(new TextEncoder().encode(process.env.DEV_JWT_SECRET));
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}/v1`;
  const env = { ...process.env, PORT: String(port), S3_ENDPOINT: endpoint.href, S3_BUCKET: bucket,
    S3_REGION: 'eu-central-1', S3_ACCESS_KEY: 'eubp-integration', S3_SECRET_KEY: 'eubp-integration-secret', S3_FORCE_PATH_STYLE: 'true' };
  delete env.NODE_TEST_CONTEXT;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: resolve(__dirname, '../..'), env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  api.stdout.on('data', chunk => { logs = (logs + chunk).slice(-20000); });
  api.stderr.on('data', chunk => { logs = (logs + chunk).slice(-20000); });
  let ready = false;
  for (let n = 0; n < 240; n++) {
    if (api.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  for (const actor of ['A', 'B']) {
    await success('/organisations/bootstrap', { actor, body: { legalName: `Gate 5 ${actor}`, countryCode: 'NL', role: 'responsible_economic_operator' } });
    models[actor] = await success('/battery-models', { actor, body: { modelIdentifier: randomUUID(), category: 'EV' } });
    const bytes = Buffer.from(`Synthetic Gate 5 source report for ${actor}.`);
    evidence[actor] = await success('/evidence/upload-sessions', { actor, body: { originalFilename: 'lifecycle.txt',
      mimeType: 'text/plain', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), evidenceType: 'test_report' } });
    assert.equal((await fetch(evidence[actor].uploadUrl, { method: 'PUT', headers: evidence[actor].requiredHeaders, body: bytes })).status, 200);
    await success(`/evidence/${evidence[actor].evidenceId}/finalize`, { actor, body: {} });
    await success(`/evidence/${evidence[actor].evidenceId}/verify`, { actor, body: {} });
    await populateModel(actor, models[actor]);
  }
}, { timeout: 180000 });

after(async () => {
  if (api && api.exitCode === null) { const stopped = once(api, 'exit'); api.kill(); await stopped; }
  await admin.$disconnect();
  if (runtimeConnected) await runtime.end();
  if (bucketCreated) {
    const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (objects.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket,
      Delete: { Objects: objects.Contents.map(object => ({ Key: object.Key })) } }));
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  s3.destroy();
});

test('Gate 5: real source evidence supports draft, ready and published v1 with reproducible hashes', async () => {
  mainItem = await makeItem();
  assert.equal(mainItem.passportState, 'draft');
  assert.equal((await request(`/passports/${mainItem.id}/publish`, { body: {} })).status, 409);
  const validation = await success(`/passports/${mainItem.id}/validate`, { body: {} });
  assert.equal(validation.readiness.verified, validation.readiness.required);
  assert.equal((await success(`/battery-items/${mainItem.id}`)).passportState, 'ready');
  v1 = await success(`/passports/${mainItem.id}/publish`, { body: {} });
  v1Stored = await admin.passportVersion.findUniqueOrThrow({ where: { id: v1.version.id } });
  assert.equal(v1Stored.versionNo, 1); assert.equal(v1Stored.previousVersionHash, null);
  assert.equal(v1Stored.sha256, hashJson(v1Stored.canonicalJson));
  assert.equal((await success(`/battery-items/${mainItem.id}`)).passportState, 'published');
  assert.equal(await admin.registrySubmission.count({ where: { batteryItemId: mainItem.id } }), 0);
  const publicView = await success(`/public/b/${mainItem.publicId}`, { actor: null });
  assert.ok(!JSON.stringify(publicView).includes('evidenceIds'));
  const snapshot = await admin.publicPassportSnapshot.findFirstOrThrow({ where: { passportVersionId: v1.version.id } });
  assert.equal(snapshot.sha256, hashJson(snapshot.publicJson));
});

test('Gate 5: changed value produces v2, links the prior hash and preserves every byte of v1', async () => {
  await value({ batteryItemId: mainItem.id }, 11, 101);
  assert.equal((await success(`/battery-items/${mainItem.id}`)).passportState, 'updated');
  await success(`/passports/${mainItem.id}/validate`, { body: {} });
  v2 = await success(`/passports/${mainItem.id}/publish`, { body: {} });
  assert.equal(v2.version.versionNo, 2); assert.equal(v2.version.previousVersionHash, v1.version.sha256);
  assert.equal(v2.version.sha256, hashJson(v2.version.canonicalJson));
  assert.deepEqual(await admin.passportVersion.findUniqueOrThrow({ where: { id: v1.version.id } }), v1Stored);
  assert.equal(await admin.publicPassportSnapshot.count({ where: { batteryItemId: mainItem.id, active: true } }), 1);
  assert.equal((await admin.publicPassportSnapshot.findFirstOrThrow({ where: { batteryItemId: mainItem.id, active: true } })).passportVersionId, v2.version.id);
});

test('Gate 5: incomplete provenance cannot publish and superseded values cannot be revalidated', async () => {
  const { item } = await publishNew();
  const first = await value({ batteryItemId: item.id }, 11, 102, 'A', false);
  assert.equal((await request(`/passports/${item.id}/publish`, { body: {} })).status, 409);
  await value({ batteryItemId: item.id }, 11, 103);
  assert.equal((await request(`/passport-values/${first.id}/validate`, { body: {} })).status, 409);
  assert.equal((await admin.passportValue.findUniqueOrThrow({ where: { id: first.id } })).validationStatus, 'superseded');
});

test('Gate 5: concurrent publication creates one version and one active snapshot', async () => {
  const item = await makeItem(); await success(`/passports/${item.id}/validate`, { body: {} });
  const responses = await Promise.all([request(`/passports/${item.id}/publish`, { body: {} }), request(`/passports/${item.id}/publish`, { body: {} })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(await admin.passportVersion.count({ where: { batteryItemId: item.id } }), 1);
  assert.equal(await admin.publicPassportSnapshot.count({ where: { batteryItemId: item.id, active: true } }), 1);
  const version = await admin.passportVersion.findFirstOrThrow({ where: { batteryItemId: item.id } });
  assert.equal(await admin.auditEvent.count({ where: { resourceId: version.id, action: 'passport.publish' } }), 1);
});

test('Gate 5: a concurrent value writer cannot sneak unvalidated data into publication', async () => {
  for (let n = 0; n < 3; n++) {
    const item = await makeItem(); await success(`/passports/${item.id}/validate`, { body: {} });
    const [publication] = await Promise.all([request(`/passports/${item.id}/publish`, { body: {} }), value({ batteryItemId: item.id }, 11, 999, 'A', false)]);
    assert.ok([201, 409].includes(publication.status), JSON.stringify(publication));
    const versions = await admin.passportVersion.findMany({ where: { batteryItemId: item.id } });
    for (const version of versions) {
      const capacity = version.canonicalJson.values.find(v => v.fieldId === 11);
      assert.equal(capacity.value, 100); assert.equal(capacity.validationStatus, 'validated');
    }
    assert.notEqual((await success(`/battery-items/${item.id}`)).passportState, 'ready');
  }
});

test('Gate 5: database rejects version rewrites, direct deletion and cascading deletion', async () => {
  await assert.rejects(runtimeQuery('UPDATE "PassportVersion" SET "sha256" = $1 WHERE "id" = $2', ['0'.repeat(64), v1.version.id]), /permission denied/);
  await assert.rejects(runtimeQuery('DELETE FROM "PassportVersion" WHERE "id" = $1', [v1.version.id]), /permission denied/);
  await assert.rejects(admin.$executeRaw`UPDATE "PassportVersion" SET "sha256" = ${'0'.repeat(64)} WHERE "id" = ${v1.version.id}`, /immutable/);
  await assert.rejects(admin.$executeRaw`DELETE FROM "BatteryItem" WHERE "id" = ${mainItem.id}`, /immutable/);
  assert.deepEqual(await admin.passportVersion.findUniqueOrThrow({ where: { id: v1.version.id } }), v1Stored);
});

test('Gate 5: missing, invented, foreign and stale prior-passport links are rejected without an event', async () => {
  const other = await publishNew(), foreign = await publishNew('B');
  const count = await admin.lifecycleEvent.count({ where: { batteryItemId: mainItem.id } });
  for (const previousPassportId of [undefined, randomUUID(), other.published.version.id, foreign.published.version.id, v1.version.id]) {
    assert.equal((await event(mainItem, 'repurpose', { previousPassportId })).status, 409);
  }
  assert.equal((await event(mainItem, 'repurpose', { previousPassportId: v2.version.id }, 'B')).status, 404);
  assert.equal(await admin.lifecycleEvent.count({ where: { batteryItemId: mainItem.id } }), count);
});

for (const [kind, status] of [['repurpose', 'repurposed'], ['reuse', 'reused'], ['remanufacture', 'remanufactured']]) {
  test(`Gate 5: ${kind} records genuine lineage and requires validated current status before a new version`, async () => {
    const { item, published } = await publishNew();
    const response = await event(item, kind, { previousPassportId: published.version.id });
    assert.equal(response.status, 201); assert.equal(response.data.previousPassportId, published.version.id);
    assert.equal(await admin.auditEvent.count({where:{resourceId:item.id,action:'lifecycle.event',metadata:{path:['eventId'],equals:response.data.id}}}),1);
    assert.equal(response.data.integrityHash, hashJson({ itemId: item.id, eventType: kind,
      eventTime: response.data.eventTime, payload: response.data.payload, previousPassportId: published.version.id }));
    const changed = await success(`/battery-items/${item.id}`);
    assert.equal(changed.lifecycleStatus, status); assert.equal(changed.passportState, 'updated');
    assert.equal((await request(`/passports/${item.id}/publish`, { body: {} })).status, 409);
    await value({ batteryItemId: item.id }, 67, status);
    await success(`/passports/${item.id}/validate`, { body: {} });
    const next = await success(`/passports/${item.id}/publish`, { body: {} });
    assert.equal(next.version.previousVersionHash, published.version.sha256);
    assert.equal(next.version.canonicalJson.battery.lifecycleStatus, status);
    assert.equal(next.version.sha256, hashJson(next.version.canonicalJson));
  });
}

test('Gate 5: generic events cannot bypass dedicated lineage or recycling transitions', async () => {
  const { item } = await publishNew();
  for (const kind of ['repair', 'accident', 'status_change']) {
    for (const status of ['repurposed', 'remanufactured', 'recycled']) {
      assert.equal((await event(item, kind, { newLifecycleStatus: status })).status, 409);
    }
  }
  assert.equal((await event(item, 'recycle', { newLifecycleStatus: 'original' })).status, 409);
  assert.equal((await event(item, 'status_change')).status, 409);
  assert.equal((await success(`/battery-items/${item.id}`)).lifecycleStatus, 'original');
  assert.equal((await event(item, 'status_change', { newLifecycleStatus: 'waste' })).status, 201);
  assert.equal((await success(`/battery-items/${item.id}`)).lifecycleStatus, 'waste');
});

test('Gate 5: recycling closes events, telemetry, value changes, validation and publication', async () => {
  const { item, published } = await publishNew();
  const original = await admin.passportVersion.findUniqueOrThrow({ where: { id: published.version.id } });
  assert.equal((await event(item, 'recycle')).status, 201);
  for (const kind of ['repair', 'reuse', 'repurpose', 'remanufacture', 'recycle']) {
    assert.equal((await event(item, kind, { previousPassportId: published.version.id })).status, 409);
  }
  for (const action of ['validate', 'publish']) assert.equal((await request(`/passports/${item.id}/${action}`, { body: {} })).status, 409);
  assert.equal((await request('/passport-values', { body: { batteryItemId: item.id, fieldDefinitionId: 11, value: 100 } })).status, 409);
  assert.equal((await request(`/lifecycle/${item.id}/telemetry`, { body: { readings: [{ measuredAt: new Date().toISOString(), metric: 'capacity', value: 100 }] } })).status, 409);
  const closed = await success(`/battery-items/${item.id}`);
  assert.equal((await success(`/passports/${item.id}/validate`)).publishable,false);
  assert.equal(closed.passportState, 'recycled'); assert.equal(closed.lifecycleStatus, 'recycled');
  assert.deepEqual(await admin.passportVersion.findUniqueOrThrow({ where: { id: published.version.id } }), original);
  assert.equal(await admin.lifecycleEvent.count({ where: { batteryItemId: item.id } }), 1);
});

test('Gate 5: model changes invalidate every ready/published inheriting item without reopening recycled items', async () => {
  const model = await success('/battery-models', { body: { modelIdentifier: randomUUID(), category: 'EV' } });
  await populateModel('A', model);
  const ready = await makeItem('A', model), published = await makeItem('A', model), recycled = await makeItem('A', model);
  for (const item of [ready, published, recycled]) await success(`/passports/${item.id}/validate`, { body: {} });
  await success(`/passports/${published.id}/publish`, { body: {} });
  await event(recycled, 'recycle');
  await value({ modelId: model.id }, 11, 102, 'A', false);
  assert.equal((await success(`/battery-items/${ready.id}`)).passportState, 'data_collection');
  assert.equal((await success(`/battery-items/${published.id}`)).passportState, 'updated');
  assert.equal((await success(`/battery-items/${recycled.id}`)).passportState, 'recycled');
  assert.equal((await request(`/passports/${ready.id}/publish`, { body: {} })).status, 409);
});

test('Gate 5: revalidating an unchanged publication cannot create a duplicate version or fake registration', async () => {
  const { item } = await publishNew();
  await success(`/passports/${item.id}/validate`, { body: {} });
  assert.equal((await success(`/battery-items/${item.id}`)).passportState, 'published');
  assert.equal((await request(`/passports/${item.id}/publish`, { body: {} })).status, 409);
  assert.equal(await admin.passportVersion.count({ where: { batteryItemId: item.id } }), 1);
  assert.equal(await admin.registrySubmission.count({ where: { batteryItemId: item.id } }), 0);
});
