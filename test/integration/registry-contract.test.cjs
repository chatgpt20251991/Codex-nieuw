const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright');
const { fields } = require('@eubp/rules');
const { hashJson } = require('../../apps/api/dist/common/crypto/canonical.js');
const { serializeRegistryDraft, XML_NAMESPACE } = require('../../apps/api/dist/modules/registry/registry-contract.js');
const { S3Client, CreateBucketCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');

const endpoint = new URL(process.env.TEST_S3_ENDPOINT || 'http://127.0.0.1:59000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.pathname !== '/') {
  throw new Error('Gate 6 requires the dedicated local MinIO integration fixture.');
}
const bucket = `eubp-registry-${randomBytes(10).toString('hex')}`;
const s3 = new S3Client({ endpoint: endpoint.href, forcePathStyle: true, region: 'eu-central-1',
  credentials: { accessKeyId: 'eubp-integration', secretAccessKey: 'eubp-integration-secret' } });
const admin = new PrismaClient({ datasources: { db: { url: process.env.TEST_ADMIN_DATABASE_URL } } });
const runtime = new Client({ connectionString: process.env.DATABASE_URL });
const orgs = { A: randomUUID(), B: randomUUID() }, tokens = {}, models = {}, evidence = {}, modelValues = {};
const published = [];
const result = { kind: 'local_preparation', outcome: 'blocked', code: 'LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED',
  externalCorrelationId: null, registryUri: null, liveSubmissionAttempted: false };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let api, base, logs = '', bucketCreated = false, runtimeConnected = false, foreign, jsonExport, xmlExport;
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

async function request(path, { actor = 'A', body } = {}) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${tokens[actor]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  return { status: response.status, data: await response.json() };
}
async function success(path, options) {
  const response = await request(path, options);
  assert.ok([200, 201].includes(response.status), `${path}: ${JSON.stringify(response)}`);
  return response.data;
}
async function value(owner, fieldDefinitionId, data, actor = 'A') {
  const row = await success('/passport-values', { actor, body: { ...owner, fieldDefinitionId, value: data } });
  await success('/evidence/link', { actor, body: { evidenceId: evidence[actor].evidenceId, passportValueId: row.id } });
  await success(`/passport-values/${row.id}/validate`, { actor, body: {} });
  return row;
}
async function populateModel(actor, model) {
  const values = {};
  for (const field of fields.filter(field => ['mandatory', 'mandatory_dynamic'].includes(field.applicability_2027_02_18[model.category]))) {
    const data = field.id === 67 ? 'original' : [10, 11, 26, 27, 28, 51].includes(field.id) ? 100 : `fixture-${field.id}`;
    values[field.id] = await value({ modelId: model.id }, field.id, data, actor);
  }
  return values;
}
async function makeItem(actor = 'A', model = models[actor], serialOrItemIdentifier = randomUUID()) {
  return success('/battery-items', { actor, body: { modelId: model.id, serialOrItemIdentifier } });
}
async function publishNew(actor = 'A', model = models[actor], serialOrItemIdentifier = randomUUID()) {
  const item = await makeItem(actor, model, serialOrItemIdentifier);
  const validation = await success(`/passports/${item.id}/validate`, { actor, body: {} });
  assert.equal(validation.publishable, true);
  const publication = await success(`/passports/${item.id}/publish`, { actor, body: {} });
  assert.equal(publication.version.sha256, hashJson(publication.version.canonicalJson));
  return { item, publication };
}
async function registryCounts() {
  return { submissions: await admin.registrySubmission.count({ where: { organisationId: { in: Object.values(orgs) } } }),
    audits: await admin.auditEvent.count({ where: { organisationId: { in: Object.values(orgs) }, action: { startsWith: 'registry.' } } }) };
}
async function rejectBatch(itemIds, serialization = 'json') {
  const before = await registryCounts();
  const rejected = await request(`/registry/export-${serialization}`, { body: { itemIds } });
  assert.equal(rejected.status, 409, JSON.stringify(rejected));
  assert.equal(rejected.data.code, 'REGISTRY_PREVALIDATION_FAILED');
  const after = await registryCounts();
  assert.equal(after.submissions, before.submissions, 'A rejected batch must leave no partial submission.');
  assert.equal(after.audits, before.audits + 1, 'The rejected request must leave one audit event.');
  assert.match(rejected.data.correlationId, uuid);
  assert.equal(await admin.auditEvent.count({ where: { organisationId: orgs.A,
    action: 'registry.prevalidation_rejected', resourceId: rejected.data.correlationId } }), 1);
  return rejected;
}
async function runtimeQuery(actor, sql, parameters) {
  await runtime.query('BEGIN');
  try {
    if (actor) await runtime.query("SELECT set_config('app.current_org_id', $1, true)", [orgs[actor]]);
    return await runtime.query(sql, parameters);
  } finally { await runtime.query('ROLLBACK'); }
}
async function checkExport(exported, serialization, itemIds) {
  assert.equal(exported.format, 'eubp-registry-draft-export');
  assert.equal(exported.contractVersion, 'eubp.registry-draft.v1');
  assert.equal(exported.serialization, serialization);
  assert.equal(exported.uploadable, false);
  assert.equal(exported.officialSchema, null);
  assert.match(exported.correlationId, uuid);
  assert.deepEqual(exported.result, result);
  assert.deepEqual(exported.batches.map(batch => batch.length), [100, 1]);
  assert.deepEqual(exported.batches.flat().map(record => record.batteryItemId), itemIds);
  assert.equal(exported.files.length, 2);
  assert.equal(new Set(exported.files.map(file => file.correlationId)).size, 2);
  const stored = await admin.registrySubmission.findMany({ where: { organisationId: orgs.A, correlationId: exported.correlationId } });
  assert.equal(stored.length, itemIds.length);
  for (const [batchIndex, batch] of exported.batches.entries()) {
    const file = exported.files[batchIndex];
    assert.equal(file.batchIndex, batchIndex);
    assert.match(file.correlationId, uuid);
    assert.equal(file.recordCount, batch.length);
    assert.equal(file.sha256, sha256(file.content));
    assert.ok(file.filename.endsWith(`.${serialization}`));
    assert.equal(file.mediaType, `application/${serialization}`);
    if (serialization === 'json') assert.deepEqual(JSON.parse(file.content), {
      contractVersion: 'eubp.registry-draft.v1', kind: 'internal_draft', uploadable: false,
      officialSchema: null, correlationId: file.correlationId, records: batch,
    });
    else assert.match(file.content, /^<\?xml/);
    for (const record of batch) {
      const original = published.find(entry => entry.item.id === record.batteryItemId);
      assert.deepEqual(record, { batteryItemId: original.item.id, passportVersionId: original.publication.version.id,
        upi: original.publication.upi, productIdentifier: original.item.serialOrItemIdentifier,
        category: 'EV', schemaVersion: original.publication.version.canonicalJson.schema,
        ruleSetVersion: original.publication.version.ruleSetVersion, passportSha256: original.publication.version.sha256,
        schemaStatus: 'draft-pending-battery-semantic-catalogue' });
      const row = stored.find(entry => entry.batteryItemId === record.batteryItemId);
      assert.equal(row.passportVersionId, record.passportVersionId);
      assert.equal(row.method, `internal_draft_${serialization}`);
      assert.equal(row.status, 'blocked');
      assert.equal(row.registryUri, null); assert.equal(row.submittedAt, null);
      assert.deepEqual(row.requestPayload.record, record);
      assert.equal(row.requestPayload.recordSha256, hashJson(record));
      assert.equal(row.requestPayload.batchIndex, batchIndex);
      assert.equal(row.requestPayload.recordIndex, batch.indexOf(record));
      assert.equal(row.requestPayload.batchCorrelationId, file.correlationId);
      assert.equal(row.requestPayload.fileSha256, file.sha256);
      assert.deepEqual(row.responsePayload, result);
      assert.ok(file.content.includes(record.batteryItemId), 'Serialized file must contain each record.');
    }
  }
  assert.equal(await admin.auditEvent.count({ where: { organisationId: orgs.A, action: 'registry.export', resourceId: exported.correlationId } }), 1);
  assert.equal(await admin.batteryItem.count({ where: { id: { in: itemIds }, passportState: 'published' } }), itemIds.length);
}

before(async () => {
  await s3.send(new CreateBucketCommand({ Bucket: bucket })); bucketCreated = true;
  await runtime.connect(); runtimeConnected = true;
  const { SignJWT } = await import('jose');
  for (const actor of Object.keys(orgs)) tokens[actor] = await new SignJWT({ org_id: orgs[actor], role: 'operator_admin' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(`gate6-${actor}`).setIssuer('eubatterypassport-dev')
    .setAudience('eubatterypassport-api').setIssuedAt().setExpirationTime('30m')
    .sign(new TextEncoder().encode(process.env.DEV_JWT_SECRET));
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}/v1`;
  const env = { ...process.env, PORT: String(port), S3_ENDPOINT: endpoint.href, S3_BUCKET: bucket,
    S3_REGION: 'eu-central-1', S3_ACCESS_KEY: 'eubp-integration', S3_SECRET_KEY: 'eubp-integration-secret', S3_FORCE_PATH_STYLE: 'true',
    BATTERY_SEMANTIC_CATALOGUE_AVAILABLE: 'false', REGISTRY_BATTERY_SUBMISSION_AVAILABLE: 'false' };
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
  for (const actor of Object.keys(orgs)) {
    await success('/organisations/bootstrap', { actor, body: { legalName: `Gate 6 ${actor}`, countryCode: 'NL', role: 'responsible_economic_operator' } });
    models[actor] = await success('/battery-models', { actor, body: { modelIdentifier: randomUUID(), category: 'EV' } });
    const bytes = Buffer.from(`Synthetic Gate 6 source report for ${actor}.`);
    evidence[actor] = await success('/evidence/upload-sessions', { actor, body: { originalFilename: 'registry.txt',
      mimeType: 'text/plain', sizeBytes: bytes.length, sha256: sha256(bytes), evidenceType: 'test_report' } });
    assert.equal((await fetch(evidence[actor].uploadUrl, { method: 'PUT', headers: evidence[actor].requiredHeaders, body: bytes })).status, 200);
    await success(`/evidence/${evidence[actor].evidenceId}/finalize`, { actor, body: {} });
    await success(`/evidence/${evidence[actor].evidenceId}/verify`, { actor, body: {} });
    modelValues[actor] = await populateModel(actor, models[actor]);
  }
  // Publication is performed by the actual API with verified provenance for
  // every item. No direct version/state seeding makes this batch eligible.
  for (let index = 0; index < 101; index++) published.push(await publishNew('A', models.A,
    index === 0 ? `Gate 6 <pack> & "quoted" 'single' 🔋\r\n${randomUUID()}` : randomUUID()));
  foreign = await publishNew('B');
}, { timeout: 300000 });

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

test('Gate 6: JSON batches 101 actual publications as 100/1 in caller order with blocked, hashed persistence', { timeout: 180000 }, async () => {
  const itemIds = published.map(entry => entry.item.id).reverse();
  jsonExport = await success('/registry/export-json', { body: { itemIds } });
  await checkExport(jsonExport, 'json', itemIds);
});

test('Gate 6: XML has the same bounded records and independent blocked correlations', { timeout: 180000 }, async () => {
  const itemIds = [...published.slice(50), ...published.slice(0, 50)].map(entry => entry.item.id);
  xmlExport = await success('/registry/export-xml', { body: { itemIds } });
  await checkExport(xmlExport, 'xml', itemIds);
  assert.notEqual(xmlExport.correlationId, jsonExport.correlationId);
  const browser = await chromium.launch({ headless: true,
    ...(process.env.TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.TEST_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage();
    for (const file of xmlExport.files) {
      const parsed = await page.evaluate(({ content, namespace }) => {
        const document = new DOMParser().parseFromString(content, 'application/xml');
        return { errors: document.getElementsByTagName('parsererror').length,
          namespace: document.documentElement.namespaceURI,
          records: [...document.getElementsByTagNameNS(namespace, 'record')].map(record =>
            Object.fromEntries([...record.children].map(field => [field.localName, field.textContent]))) };
      }, { content: file.content, namespace: XML_NAMESPACE });
      assert.equal(parsed.errors, 0);
      assert.equal(parsed.namespace, XML_NAMESPACE);
      assert.deepEqual(parsed.records, xmlExport.batches[file.batchIndex]);
      assert.ok(parsed.records.every(record => Object.keys(record).length === 9));
    }
    assert.ok(published[0].item.serialOrItemIdentifier.includes('\r\n'), 'The real publication includes XML escaping and newline cases.');
  } finally { await browser.close(); }
});

test('Gate 6: mixed EV and LMT publications form separate trusted groups in first-seen order', { timeout: 120000 }, async () => {
  const model = await success('/battery-models', { body: { modelIdentifier: randomUUID(), category: 'LMT' } });
  await populateModel('A', model);
  const lmt = await publishNew('A', model);
  const itemIds = [published[0].item.id, lmt.item.id, published[1].item.id];
  const grouped = await success('/registry/export-json', { body: { itemIds } });
  assert.deepEqual(grouped.batches.map(batch => batch.map(record => record.batteryItemId)),
    [[published[0].item.id, published[1].item.id], [lmt.item.id]]);
  assert.deepEqual(grouped.batches.map(batch => batch.map(record => record.category)), [['EV', 'EV'], ['LMT']]);
  assert.deepEqual(grouped.files.map(file => file.recordCount), [2, 1]);
  const source = new Map([published[0], lmt, published[1]].map(entry => [entry.item.id, entry.publication.version]));
  for (const record of grouped.batches.flat()) {
    const version = source.get(record.batteryItemId);
    assert.equal(record.passportVersionId, version.id);
    assert.equal(record.category, version.canonicalJson.battery.category);
    assert.equal(record.schemaVersion, version.canonicalJson.schema);
    assert.equal(record.ruleSetVersion, version.ruleSetVersion);
    assert.equal(record.passportSha256, version.sha256);
  }
  for (const file of grouped.files) {
    assert.deepEqual(JSON.parse(file.content).records, grouped.batches[file.batchIndex]);
    assert.equal(file.sha256, sha256(file.content));
  }
  const retrieved = await success(`/registry/exports/${grouped.correlationId}`);
  assert.deepEqual(retrieved.submissions.map(row => row.requestPayload.record), grouped.batches.flat());
  assert.deepEqual(grouped.result, result);
  assert.ok(retrieved.submissions.every(row => row.status === 'blocked' && row.registryUri === null && row.submittedAt === null));
});

test('Gate 6: JSON and XML strictly reject malformed, duplicate, empty and oversized input without writes', async () => {
  const before = await registryCounts();
  for (const serialization of ['json', 'xml']) {
    for (const body of [null, {}, { itemIds: [] }, { itemIds: ['not-a-uuid'] }, { itemIds: null },
      { itemIds: [published[0].item.id, published[0].item.id] },
      { itemIds: Array.from({ length: 1001 }, () => randomUUID()) },
      { itemIds: [published[0].item.id], organisationId: orgs.B },
      { itemIds: [published[0].item.id], status: 'registered', registryUri: 'https://registry.example.invalid/fake' }]) {
      const response = await request(`/registry/export-${serialization}`, { body });
      assert.equal(response.status, 400, JSON.stringify(response));
    }
  }
  assert.deepEqual(await registryCounts(), before);
});

test('Gate 6: one missing or foreign item rejects the entire batch with the same unavailable result', async () => {
  for (const invalidId of [randomUUID(), foreign.item.id]) {
    for (const serialization of ['json', 'xml']) {
      // The failure is in record 101: even the complete first batch must not
      // acquire a partial persisted export.
      const rejected = await rejectBatch([...published.slice(0, 100).map(entry => entry.item.id), invalidId], serialization);
      assert.deepEqual(rejected.data.invalid, [{ itemId: invalidId, code: 'ITEM_NOT_AVAILABLE' }]);
      assert.ok(!JSON.stringify(rejected.data).includes(orgs.B));
    }
  }
});

test('Gate 6: rejected export correlations retain their local result with tenant-isolated retrieval', async () => {
  const unavailableId = randomUUID();
  const rejected = await rejectBatch([published[0].item.id, unavailableId]);
  const correlationId = rejected.data.correlationId;
  const retained = await success(`/registry/exports/${correlationId}`);
  assert.deepEqual(retained, { correlationId, submissions: [],
    result: { kind: 'local_prevalidation', outcome: 'rejected', code: 'REGISTRY_PREVALIDATION_FAILED',
      externalCorrelationId: null, registryUri: null, liveSubmissionAttempted: false },
    errorReport: { invalid: [{ itemId: unavailableId, code: 'ITEM_NOT_AVAILABLE' }], requestedCount: 2 } });
  assert.equal(await admin.registrySubmission.count({ where: { correlationId } }), 0);
  const foreignRead = await request(`/registry/exports/${correlationId}`, { actor: 'B' });
  const unknown = await request(`/registry/exports/${randomUUID()}`, { actor: 'B' });
  assert.equal(foreignRead.status, 404); assert.equal(unknown.status, 404);
  assert.deepEqual(foreignRead.data, unknown.data);
});

test('Gate 6: draft and ready items cannot enter an export without a published version', async () => {
  const draft = await makeItem(), ready = await makeItem();
  await success(`/passports/${ready.id}/validate`, { body: {} });
  for (const item of [draft, ready]) await rejectBatch([published[0].item.id, item.id]);
  assert.equal(await admin.passportVersion.count({ where: { batteryItemId: { in: [draft.id, ready.id] } } }), 0);
});

test('Gate 6: changed and recycled items cannot export an obsolete published version', async () => {
  const changed = await publishNew(), recycled = await publishNew();
  await value({ batteryItemId: changed.item.id }, 11, 101);
  await success(`/lifecycle/${recycled.item.id}/events`, { body: { eventType: 'recycle', eventTime: new Date().toISOString() } });
  for (const entry of [changed, recycled]) {
    await rejectBatch([published[0].item.id, entry.item.id]);
    assert.equal(await admin.passportVersion.count({ where: { batteryItemId: entry.item.id } }), 1);
  }
  assert.equal((await success(`/battery-items/${changed.item.id}`)).passportState, 'updated');
  assert.equal((await success(`/battery-items/${recycled.item.id}`)).passportState, 'recycled');
  await success(`/passports/${changed.item.id}/validate`, { body: {} });
  assert.equal((await success(`/battery-items/${changed.item.id}`)).passportState, 'ready');
  await rejectBatch([published[0].item.id, changed.item.id]);
});

test('Gate 6: evidence that expires after publication blocks the complete export', async () => {
  const original = await admin.evidenceObject.findUniqueOrThrow({ where: { id: evidence.A.evidenceId } });
  try {
    await admin.evidenceObject.update({ where: { id: original.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
    assert.equal((await success(`/battery-items/${published[0].item.id}`)).passportState, 'published');
    await rejectBatch([published[0].item.id, published[1].item.id]);
  } finally {
    await admin.evidenceObject.update({ where: { id: original.id }, data: { expiresAt: original.expiresAt } });
  }
});

test('Gate 6: current compliance blockers are rechecked even if legacy data still says published', async () => {
  const original = await admin.passportValue.findUniqueOrThrow({ where: { id: modelValues.A[11].id } });
  try {
    // Simulate a legacy/imported inconsistency without rewriting immutable v1.
    await admin.passportValue.update({ where: { id: original.id }, data: { valueJson: -1 } });
    await rejectBatch([published[0].item.id, published[1].item.id], 'xml');
    assert.equal((await success(`/battery-items/${published[0].item.id}`)).passportState, 'published');
    const version = await admin.passportVersion.findUniqueOrThrow({ where: { id: published[0].publication.version.id } });
    assert.deepEqual(version.canonicalJson, published[0].publication.version.canonicalJson);
  } finally {
    await admin.passportValue.update({ where: { id: original.id }, data: { valueJson: original.valueJson } });
  }
});

test('Gate 6: legacy publications with malformed contract metadata retain a rejected local result', async () => {
  const sample = published[2].publication.version;
  for (const invalidField of ['ruleSetVersion', 'schema']) {
    const item = await makeItem();
    const upi = `https://id.example.invalid/b/${item.publicId}`;
    const canonical = structuredClone(sample.canonicalJson);
    canonical.generatedAt = new Date().toISOString();
    canonical.battery = { ...canonical.battery, id: item.id, publicId: item.publicId,
      serial: item.serialOrItemIdentifier, upi };
    canonical[invalidField] = '';
    // A newly inserted, synthetic legacy publication exercises imported malformed
    // metadata. No existing immutable version is updated and no trigger is disabled.
    const version = await admin.$transaction(async tx => {
      const row = await tx.passportVersion.create({ data: { organisationId: orgs.A, batteryItemId: item.id,
        versionNo: 1, ruleSetVersion: canonical.ruleSetVersion, canonicalJson: canonical,
        sha256: hashJson(canonical), previousVersionHash: null, publicationState: 'published', publishedAt: new Date() } });
      await tx.batteryItem.update({ where: { id: item.id }, data: { upi, passportState: 'published' } });
      return row;
    });
    const rejected = await rejectBatch([published[0].item.id, item.id]);
    assert.deepEqual(rejected.data.invalid, [{ itemId: item.id, code: 'INVALID_CONTRACT_METADATA' }]);
    const retained = await success(`/registry/exports/${rejected.data.correlationId}`);
    assert.deepEqual(retained.errorReport, { requestedCount: 2, invalid: rejected.data.invalid });
    assert.equal(retained.result.outcome, 'rejected');
    assert.equal(retained.result.liveSubmissionAttempted, false);
    assert.deepEqual(retained.submissions, []);
    assert.deepEqual(await admin.passportVersion.findUniqueOrThrow({ where: { id: version.id } }), version);
  }
});

test('Gate 6: missing or unsafe HTTPS identifiers fail closed for the entire batch', async () => {
  const entry = await publishNew();
  try {
    for (const upi of [null, 'http://id.example.invalid/b/one', 'https://',
      'https://user:password@id.example.invalid/b/one', 'https://id.example.invalid/b/one#fragment']) {
      await admin.batteryItem.update({ where: { id: entry.item.id }, data: { upi } });
      await rejectBatch([published[0].item.id, entry.item.id]);
    }
  } finally {
    await admin.batteryItem.update({ where: { id: entry.item.id }, data: { upi: entry.publication.upi } });
  }
});

test('Gate 6: database uniqueness prevents another tenant from reusing an existing UPI', async () => {
  const before = await registryCounts();
  await assert.rejects(admin.batteryItem.update({ where: { id: foreign.item.id }, data: { upi: published[0].publication.upi } }),
    error => error.code === 'P2002');
  assert.equal((await admin.batteryItem.findUniqueOrThrow({ where: { id: foreign.item.id } })).upi, foreign.publication.upi);
  assert.deepEqual(await registryCounts(), before);
});

test('Gate 6: correlation retrieval exposes only the authenticated tenant and treats unknown/foreign alike', async () => {
  const own = await success(`/registry/exports/${jsonExport.correlationId}`);
  assert.equal(own.correlationId, jsonExport.correlationId);
  assert.equal(own.submissions.length, 101);
  assert.ok(own.submissions.every(row => row.organisationId === orgs.A && row.correlationId === jsonExport.correlationId));
  assert.deepEqual(own.submissions.map(row => row.requestPayload.record), jsonExport.batches.flat());
  for (const file of jsonExport.files) {
    const records = own.submissions.filter(row => row.requestPayload.batchIndex === file.batchIndex)
      .map(row => row.requestPayload.record);
    // PostgreSQL JSONB may reorder object keys. The versioned serializer must
    // restore the wire representation from persisted records, not rely on that order.
    const reconstructed = serializeRegistryDraft(records, 'json', file.correlationId);
    assert.equal(reconstructed, file.content);
    assert.equal(sha256(reconstructed), file.sha256);
  }
  const missing = await request(`/registry/exports/${randomUUID()}`);
  const other = await request(`/registry/exports/${jsonExport.correlationId}`, { actor: 'B' });
  assert.equal(missing.status, 404); assert.equal(other.status, 404);
  assert.deepEqual(other.data, missing.data);
  assert.equal((await request(`/registry/exports/${jsonExport.correlationId}`, { actor: null })).status, 401);
});

test('Gate 6: runtime RLS hides another tenant correlation and denies cross-tenant result changes', async () => {
  const own = await runtimeQuery('A', 'SELECT id FROM "RegistrySubmission" WHERE "correlationId" = $1', [jsonExport.correlationId]);
  assert.equal(own.rowCount, 101);
  assert.equal((await runtimeQuery('B', 'SELECT id FROM "RegistrySubmission" WHERE "correlationId" = $1', [jsonExport.correlationId])).rowCount, 0);
  assert.equal((await runtimeQuery(null, 'SELECT id FROM "RegistrySubmission" WHERE "correlationId" = $1', [jsonExport.correlationId])).rowCount, 0);
  assert.equal((await runtimeQuery('B', 'UPDATE "RegistrySubmission" SET "registryUri" = $1 WHERE "correlationId" = $2 RETURNING id',
    ['https://registry.example.invalid/fake', jsonExport.correlationId])).rowCount, 0);
  assert.equal(await admin.registrySubmission.count({ where: { correlationId: jsonExport.correlationId, registryUri: { not: null } } }), 0);
});

test('Gate 6: item preparation persists a blocked local result and audit without registry state changes', async () => {
  const entry = published[0];
  const prepared = await success(`/registry/items/${entry.item.id}/prepare`, { body: {} });
  assert.equal(prepared.gate.allowed, false);
  assert.equal(prepared.submission.status, 'blocked');
  assert.match(prepared.submission.correlationId, uuid);
  assert.equal(prepared.submission.registryUri, null); assert.equal(prepared.submission.submittedAt, null);
  const stored = await admin.registrySubmission.findUniqueOrThrow({ where: { id: prepared.submission.id } });
  assert.deepEqual(stored.responsePayload, result);
  assert.equal(stored.passportVersionId, entry.publication.version.id);
  assert.equal(await admin.auditEvent.count({ where: { organisationId: orgs.A, action: 'registry.prepare', resourceId: stored.correlationId } }), 1);
  assert.equal((await success(`/battery-items/${entry.item.id}`)).passportState, 'published');
  const before = await registryCounts();
  assert.ok([404, 409].includes((await request(`/registry/items/${foreign.item.id}/prepare`, { body: {} })).status));
  assert.equal((await registryCounts()).submissions, before.submissions);
});

test('Gate 6: submit remains disabled, persists the local attempt and cannot manufacture external success', async () => {
  const entry = published[0];
  const beforeVersions = await admin.passportVersion.findMany({ where: { batteryItemId: entry.item.id } });
  const denied = await request(`/registry/items/${entry.item.id}/submit`, { body: {} });
  assert.equal(denied.status, 409);
  assert.equal(denied.data.code, 'LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED');
  assert.match(denied.data.correlationId, uuid);
  const rows = await admin.registrySubmission.findMany({ where: { organisationId: orgs.A, correlationId: denied.data.correlationId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'blocked'); assert.equal(rows[0].registryUri, null); assert.equal(rows[0].submittedAt, null);
  assert.deepEqual(rows[0].responsePayload, result);
  assert.equal(await admin.auditEvent.count({ where: { organisationId: orgs.A,
    action: 'registry.submit_blocked', resourceId: denied.data.correlationId } }), 1);
  assert.equal((await success(`/battery-items/${entry.item.id}`)).passportState, 'published');
  assert.deepEqual(await admin.passportVersion.findMany({ where: { batteryItemId: entry.item.id } }), beforeVersions);
  const beforeSpoof = await registryCounts();
  for (const action of ['prepare', 'submit']) {
    const forged = await request(`/registry/items/${entry.item.id}/${action}`, { body: {
      status: 'registered', registryUri: 'https://registry.example.invalid/fake', externalCorrelationId: randomUUID(),
    } });
    assert.equal(forged.status, 400, JSON.stringify(forged));
  }
  assert.deepEqual(await registryCounts(), beforeSpoof);
  assert.equal(await admin.registrySubmission.count({ where: { organisationId: { in: Object.values(orgs) },
    OR: [{ status: 'registered' }, { registryUri: { not: null } }, { submittedAt: { not: null } }] } }), 0);
});
