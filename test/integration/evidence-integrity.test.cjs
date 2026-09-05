const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright');
const { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');

const endpoint = new URL(process.env.TEST_S3_ENDPOINT || 'http://127.0.0.1:59000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.pathname !== '/') {
  throw new Error('Gate 4 requires a dedicated, local MinIO endpoint.');
}
const bucket = `eubp-test-${randomBytes(10).toString('hex')}`;
const accessKeyId = 'eubp-integration', secretAccessKey = 'eubp-integration-secret';
const s3 = new S3Client({ endpoint: endpoint.href, forcePathStyle: true, region: 'eu-central-1',
  credentials: { accessKeyId, secretAccessKey } });
const admin = new PrismaClient({ datasources: { db: { url: process.env.TEST_ADMIN_DATABASE_URL } } });
const orgs = { A: randomUUID(), B: randomUUID() }, tokens = {};
const bytes = Buffer.from('Gate 4: real evidence bytes, no customer data.\n');
const sha = body => createHash('sha256').update(body).digest('hex');
let api, base, browser, page, fixtureServer, model, item, supplierToken, supplierId, browserUpload;
let bucketCreated = false, logs = '', extractorCalls = 0;

async function request(path, { actor = 'A', body, supplier } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (actor) headers.authorization = `Bearer ${tokens[actor]}`;
  if (supplier) headers['x-supplier-token'] = supplier;
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: response.status, data: await response.json() };
}
async function success(path, options) {
  const result = await request(path, options);
  assert.ok([200, 201].includes(result.status), `${path}: ${JSON.stringify(result)}`);
  return result.data;
}
async function session(overrides = {}, supplier) {
  return success(supplier ? '/supplier-portal/evidence/upload-session' : '/evidence/upload-sessions', {
    actor: supplier ? null : 'A', supplier,
    body: { originalFilename: 'test-evidence.txt', mimeType: 'text/plain', sizeBytes: bytes.length,
      sha256: sha(bytes), evidenceType: 'source_document', ...overrides },
  });
}
async function put(upload, body = bytes, extraHeaders = {}) {
  return fetch(upload.uploadUrl, { method: 'PUT', headers: { ...upload.requiredHeaders, ...extraHeaders },
    body, signal: AbortSignal.timeout(15000) });
}
async function stored(id) { return admin.evidenceObject.findUniqueOrThrow({ where: { id } }); }
async function overwrite(id, body) {
  const row = await stored(id);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: row.objectKey, Body: body,
    ContentType: row.mimeType, Metadata: { sha256: row.sha256 } }));
}
async function uploaded() {
  const upload = await session();
  assert.equal((await put(upload)).status, 200);
  await success(`/evidence/${upload.evidenceId}/finalize`, { body: {} });
  return upload;
}

before(async () => {
  let storageReady = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(new URL('/minio/health/ready', endpoint), { signal: AbortSignal.timeout(1000) })).ok) {
        storageReady = true; break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(storageReady, 'Start the dedicated MinIO integration fixture on TEST_S3_ENDPOINT (default port 59000).');
  await s3.send(new CreateBucketCommand({ Bucket: bucket })); bucketCreated = true;
  const { SignJWT } = await import('jose');
  for (const [name, organisationId] of Object.entries(orgs)) {
    tokens[name] = await new SignJWT({ org_id: organisationId, role: 'operator_admin' }).setProtectedHeader({ alg: 'HS256' })
      .setSubject(`gate4-${name}`).setIssuer('eubatterypassport-dev').setAudience('eubatterypassport-api')
      .setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(process.env.DEV_JWT_SECRET));
  }
  fixtureServer = createServer(async (req, res) => {
    try {
      if (req.url === '/extract') {
        assert.equal(req.headers.authorization, 'Bearer gate4-extractor-secret');
        let body = ''; for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body);
        const download = await fetch(payload.evidence.downloadUrl);
        assert.equal(download.status, 200);
        assert.equal(await download.text(), bytes.toString());
        extractorCalls++;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ claims: [{ fieldDefinitionId: 11, value: 72, confidence: 0.99,
          state: 'validated', validationStatus: 'validated', evidenceIds: ['forged'] }] }));
      } else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Gate 4 browser transport test</title>'); }
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
  fixtureServer.listen(18080, '127.0.0.1'); await once(fixtureServer, 'listening');
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}/v1`;
  const env = { ...process.env, PORT: String(port), S3_ENDPOINT: endpoint.href, S3_REGION: 'eu-central-1',
    S3_BUCKET: bucket, S3_ACCESS_KEY: accessKeyId, S3_SECRET_KEY: secretAccessKey, S3_FORCE_PATH_STYLE: 'true',
    EVIDENCE_EXTRACTOR: 'webhook', EXTRACTION_WEBHOOK_URL: 'http://127.0.0.1:18080/extract',
    EXTRACTION_WEBHOOK_SECRET: 'gate4-extractor-secret', WEB_ORIGIN: 'http://127.0.0.1:18080' };
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
  for (const actor of ['A', 'B']) await success('/organisations/bootstrap', { actor,
    body: { legalName: `Gate 4 ${actor}`, countryCode: 'NL', role: 'responsible_economic_operator' } });
  model = await success('/battery-models', { body: { modelIdentifier: 'gate4-model', category: 'EV' } });
  item = await success('/battery-items', { body: { modelId: model.id, serialOrItemIdentifier: 'gate4-item' } });
  const supplier = await success('/suppliers', { body: { legalName: 'Gate 4 supplier' } }); supplierId = supplier.id;
  const invite = await success('/supplier-requests', { body: { supplierId, modelId: model.id, fieldDefinitionIds: [11] } });
  supplierToken = new URLSearchParams(new URL(invite.inviteUrl).hash.slice(1)).get('token');
  browser = await chromium.launch({ headless: true,
    ...(process.env.TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.TEST_BROWSER_EXECUTABLE } : {}) });
  page = await browser.newPage(); await page.goto('http://127.0.0.1:18080');
}, { timeout: 120000 });

after(async () => {
  if (browser) await browser.close();
  if (api && api.exitCode === null) { const stopped = once(api, 'exit'); api.kill(); await stopped; }
  if (fixtureServer?.listening) await new Promise(resolve => fixtureServer.close(resolve));
  await admin.$disconnect();
  if (bucketCreated) {
    // Only the random bucket created by this suite is ever emptied or deleted.
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (list.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket,
      Delete: { Objects: list.Contents.map(object => ({ Key: object.Key })) } }));
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  s3.destroy();
});

test('Gate 4: real browser hashes, signs, uploads and finalizes private evidence across origins', async () => {
  const result = await page.evaluate(async ({ base, token, content }) => {
    const file = new File([content], 'browser-evidence.txt', { type: 'text/plain' });
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const response = await fetch(base + '/evidence/upload-sessions', { method: 'POST', headers,
      body: JSON.stringify({ originalFilename: file.name, mimeType: file.type, sizeBytes: file.size,
        sha256: hash, evidenceType: 'source_document' }) });
    const upload = await response.json();
    if (!response.ok) return { error: upload };
    const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.requiredHeaders, body: file });
    const finalized = await fetch(`${base}/evidence/${upload.evidenceId}/finalize`, { method: 'POST', headers });
    return { upload, putStatus: put.status, status: finalized.status, evidence: await finalized.json() };
  }, { base, token: tokens.A, content: bytes.toString() });
  assert.equal(result.putStatus, 200, JSON.stringify(result));
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(result.evidence.verificationStatus, 'uploaded');
  browserUpload = result.upload;
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: result.evidence.objectKey }));
  assert.equal(await object.Body.transformToString(), bytes.toString());
  assert.equal((await fetch(`${endpoint.href}${bucket}/${result.evidence.objectKey}`)).status, 403);
});

test('Gate 4: mandatory values remain unvalidated until linked evidence is explicitly verified', async () => {
  const value = await success('/passport-values', { body: { batteryItemId: item.id, fieldDefinitionId: 11, value: 72 } });
  assert.equal((await request(`/passport-values/${value.id}/validate`, { body: {} })).status, 409);
  await success('/evidence/link', { body: { passportValueId: value.id, evidenceId: browserUpload.evidenceId } });
  assert.equal((await request(`/passport-values/${value.id}/validate`, { body: {} })).status, 409);
  assert.equal((await success(`/passports/${item.id}/validate`)).readiness.verified, 0);
  await success(`/evidence/${browserUpload.evidenceId}/verify`, { body: {} });
  await success(`/passport-values/${value.id}/validate`, { body: {} });
  assert.equal((await success(`/passports/${item.id}/validate`)).readiness.verified, 1);
});

test('Gate 4: missing uploads fail finalization and verification without changing state', async () => {
  const upload = await session();
  const result = await request(`/evidence/${upload.evidenceId}/finalize`, { body: {} });
  assert.equal(result.status, 409); assert.equal(result.data.code, 'UPLOAD_NOT_FOUND');
  assert.equal((await request(`/evidence/${upload.evidenceId}/verify`, { body: {} })).status, 409);
  assert.equal((await stored(upload.evidenceId)).verificationStatus, 'pending_upload');
});

test('Gate 4: signed PUT rejects corrupt bytes and altered checksum headers', async () => {
  const upload = await session();
  const corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
  assert.ok([400, 403].includes((await put(upload, corrupt)).status));
  assert.ok([400, 403].includes((await put(upload, bytes, { 'x-amz-checksum-sha256': Buffer.alloc(32).toString('base64') })).status));
  assert.equal((await stored(upload.evidenceId)).verificationStatus, 'pending_upload');
});

test('Gate 4: forged metadata never substitutes for content-byte hashing', async () => {
  const upload = await session();
  const corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
  await overwrite(upload.evidenceId, corrupt);
  const result = await request(`/evidence/${upload.evidenceId}/finalize`, { body: {} });
  assert.equal(result.status, 409); assert.equal(result.data.code, 'UPLOAD_CONTENT_HASH_MISMATCH');
  assert.equal((await stored(upload.evidenceId)).verificationStatus, 'pending_upload');
});

test('Gate 4: incorrect stored size fails finalization', async () => {
  const upload = await session({ sizeBytes: bytes.length + 1 });
  await overwrite(upload.evidenceId, bytes);
  const result = await request(`/evidence/${upload.evidenceId}/finalize`, { body: {} });
  assert.equal(result.status, 409); assert.equal(result.data.code, 'UPLOAD_SIZE_MISMATCH');
  assert.equal((await stored(upload.evidenceId)).verificationStatus, 'pending_upload');
});

test('Gate 4: verification rechecks bytes and repeated finalization preserves verified status', async () => {
  const upload = await uploaded();
  await overwrite(upload.evidenceId, Buffer.from('x'.repeat(bytes.length)));
  const failed = await request(`/evidence/${upload.evidenceId}/verify`, { body: {} });
  assert.equal(failed.status, 409); assert.equal(failed.data.code, 'UPLOAD_CONTENT_HASH_MISMATCH');
  assert.equal((await stored(upload.evidenceId)).verificationStatus, 'uploaded');
  await overwrite(upload.evidenceId, bytes);
  await success(`/evidence/${upload.evidenceId}/verify`, { body: {} });
  await success(`/evidence/${upload.evidenceId}/finalize`, { body: {} });
  assert.equal((await stored(upload.evidenceId)).verificationStatus, 'verified');
});

test('Gate 4: supplier uploads use the same integrity gates and cannot cross ownership', async () => {
  const upload = await session({}, supplierToken);
  assert.equal((await put(upload)).status, 200);
  const options = { actor: null, supplier: supplierToken, body: {} };
  assert.equal((await request(`/supplier-portal/evidence/${browserUpload.evidenceId}/finalize`, options)).status, 404);
  assert.equal((await request(`/evidence/${upload.evidenceId}/finalize`, { actor: 'B', body: {} })).status, 404);
  assert.equal((await request(`/evidence/${upload.evidenceId}/verify`, { actor: 'B', body: {} })).status, 404);
  await success(`/supplier-portal/evidence/${upload.evidenceId}/finalize`, options);
  assert.equal((await stored(upload.evidenceId)).verificationStatus, 'uploaded');
  const bad = await session({}, supplierToken); await overwrite(bad.evidenceId, Buffer.from('x'.repeat(bytes.length)));
  assert.equal((await request(`/supplier-portal/evidence/${bad.evidenceId}/finalize`, options)).status, 409);
});

test('Gate 4: expired evidence cannot validate a value or count as verified readiness', async () => {
  const value = await admin.passportValue.findFirstOrThrow({ where: { batteryItemId: item.id, fieldDefinitionId: 11 } });
  await admin.evidenceObject.update({ where: { id: browserUpload.evidenceId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await request(`/passport-values/${value.id}/validate`, { body: {} })).status, 409);
  assert.equal((await success(`/passports/${item.id}/validate`)).readiness.verified, 0);
  const upload = await uploaded();
  await admin.evidenceObject.update({ where: { id: upload.evidenceId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await request(`/evidence/${upload.evidenceId}/verify`, { body: {} })).status, 409);
});

test('Gate 4: extractor reads real evidence but can only create suggestions', async () => {
  const pending = await session();
  assert.equal((await request(`/evidence/${pending.evidenceId}/extract`, { body: {} })).status, 409);
  const upload = await uploaded();
  const count = await admin.passportValue.count({ where: { organisationId: orgs.A } });
  const prior = await success(`/passports/${item.id}/validate`);
  const result = await success(`/evidence/${upload.evidenceId}/extract`, { body: {} });
  assert.equal(result.claimCount, 1);
  assert.equal(extractorCalls, 1);
  const claims = await admin.extractedClaim.findMany({ where: { extractionJobId: result.jobId } });
  assert.equal(claims[0].state, 'suggested'); assert.equal(claims[0].passportValueId, null);
  assert.equal(await admin.passportValue.count({ where: { organisationId: orgs.A } }), count);
  assert.equal((await success(`/passports/${item.id}/validate`)).readiness.verified, prior.readiness.verified);
});

test('Gate 4: concurrent upload sessions allocate distinct keys without a shared pending placeholder', async () => {
  const uploads = await Promise.all(Array.from({ length: 5 }, () => session({ organisationId: orgs.B })));
  const rows = await Promise.all(uploads.map(upload => stored(upload.evidenceId)));
  assert.equal(new Set(rows.map(row => row.objectKey)).size, 5);
  assert.ok(rows.every(row => row.organisationId === orgs.A && row.objectKey.startsWith(`orgs/${orgs.A}/evidence/`)));
});

test('Gate 4: completed evidence transitions and extraction have audit records', async () => {
  const rows = await admin.auditEvent.findMany({ where: { organisationId: orgs.A } });
  for (const action of ['evidence.upload_session', 'evidence.finalize', 'evidence.verify', 'evidence.extract']) {
    assert.ok(rows.some(row => row.action === action), action);
  }
});
