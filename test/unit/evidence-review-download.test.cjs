'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { EvidenceStorageService } = require('../../apps/api/dist/common/storage/evidence-storage.service');
const { StorageService } = require('../../apps/api/dist/common/storage/storage.service');
const { EvidenceController } = require('../../apps/api/dist/modules/evidence/evidence.controller');
const { ROLES_KEY } = require('../../apps/api/dist/common/auth/roles.decorator');

function fixture(patch = {}) {
  const organisationId = randomUUID(), id = randomUUID(), hash = 'a'.repeat(64), now = new Date(Date.now() - 1000);
  const evidence = { id, organisationId, objectKey: 'orgs/' + organisationId + '/evidence/' + id + '/source.txt',
    originalFilename: 'source.txt', verificationStatus: 'uploaded', uploadedAt: now, updatedAt: now,
    expiresAt: null, issuedAt: null, sha256: hash, sizeBytes: 20n,
    storageChecksum: Buffer.from(hash, 'hex').toString('base64'), storageVersionId: 'immutable-v1',
    malwareScanSha256: hash, malwareScannedAt: now, malwareScannerVersion: 'ClamAV 1.4.6/28000', ...patch };
  const calls = { heads: [], signatures: [], audits: [], tenants: [], queries: [] };
  const tx = { $queryRaw: async () => [],
    evidenceObject: { findFirstOrThrow: async query => { calls.queries.push(query); return { ...evidence }; } },
    auditEvent: { create: async input => { calls.audits.push(input.data); return input.data; } } };
  const tenantDb = { run: async (org, fn) => { calls.tenants.push(org); return fn(tx); } };
  const storage = {
    checksumBase64: value => Buffer.from(value, 'hex').toString('base64'),
    head: async (...args) => { calls.heads.push(args); return { VersionId: 'immutable-v1', ContentLength: 20, Metadata: { sha256: hash } }; },
    createReviewDownloadUrl: async input => { calls.signatures.push(input); return 'https://storage.example/private?signature=synthetic-secret'; },
  };
  return { service: new EvidenceStorageService(tenantDb, storage), evidence, calls, tx, storage, organisationId, id };
}

test('review download binds finalized scanned immutable bytes without verifying evidence and audits no URL', async () => {
  const f = fixture(), before = { ...f.evidence };
  const result = await f.service.reviewDownload(f.organisationId, f.id, 'reviewer');
  assert.equal(result.evidenceId, f.id); assert.equal(result.method, 'GET'); assert.equal(result.expiresInSeconds, 60);
  assert.equal(result.reviewStatus, 'not_recorded');
  assert.equal(f.calls.heads[0][1], 'immutable-v1'); assert.equal(f.calls.signatures[0].versionId, 'immutable-v1');
  assert.ok(f.calls.heads[0][2] instanceof AbortSignal);
  assert.deepEqual(f.calls.tenants, [f.organisationId, f.organisationId]);
  assert.ok(f.calls.queries.every(query => query.where.organisationId === f.organisationId));
  assert.deepEqual(f.evidence, before);
  const event = f.calls.audits[0];
  assert.equal(event.action, 'evidence.review_download_issued'); assert.equal(event.actorSubject, 'reviewer');
  assert.equal(event.resourceId, f.id); assert.match(event.metadata.issuanceId, /^[a-f0-9-]{36}$/);
  assert.equal(event.metadata.expiresAt, result.expiresAt);
  assert.equal(JSON.stringify(event).includes('synthetic-secret'), false);
  assert.equal(Object.hasOwn(event.metadata, 'downloadUrl'), false);
});

test('unfinalized, unscanned, invalid, expired and rejected evidence fails before signing even in development', async () => {
  const cases = [{ verificationStatus: 'pending_upload' }, { verificationStatus: 'rejected' }, { verificationStatus: 'superseded' },
    { uploadedAt: null }, { malwareScanSha256: null }, { malwareScanSha256: 'b'.repeat(64) }, { malwareScannedAt: null },
    { malwareScannedAt: new Date(Date.now() + 60000) }, { malwareScannerVersion: null }, { storageVersionId: null },
    { storageVersionId: 'null' }, { storageChecksum: null }, { objectKey: 'another-tenant/source.txt' }, { sizeBytes: 0n },
    { expiresAt: new Date(Date.now() - 1000) }, { issuedAt: new Date(Date.now() + 60000) }];
  for (const patch of cases) {
    const f = fixture(patch);
    await assert.rejects(f.service.reviewDownload(f.organisationId, f.id, 'reviewer'), error => error.getStatus() === 409);
    assert.equal(f.calls.signatures.length, 0); assert.equal(f.calls.audits.length, 0);
  }
});

test('review download rejects version, size and integrity metadata mismatch from storage HEAD', async () => {
  for (const patch of [{ VersionId: 'latest-v2' }, { ContentLength: 21 }, { Metadata: {} }]) {
    const f = fixture();
    f.storage.head = async () => ({ VersionId: 'immutable-v1', ContentLength: 20, Metadata: { sha256: f.evidence.sha256 }, ...patch });
    await assert.rejects(f.service.reviewDownload(f.organisationId, f.id, 'reviewer'), error => error.getResponse().code === 'EVIDENCE_REVIEW_VERSION_MISMATCH');
    assert.equal(f.calls.signatures.length, 0); assert.equal(f.calls.audits.length, 0);
  }
});

test('review download rechecks current state after I/O under a tenant row lock', async () => {
  for (const patch of [{ verificationStatus: 'rejected' }, { updatedAt: new Date() },
    { expiresAt: new Date(Date.now() - 1000) }, { storageVersionId: 'other-version' }]) {
    const f = fixture();
    f.storage.head = async () => { Object.assign(f.evidence, patch); return { VersionId: 'immutable-v1', ContentLength: 20, Metadata: { sha256: f.evidence.sha256 } }; };
    await assert.rejects(f.service.reviewDownload(f.organisationId, f.id, 'reviewer'), error => error.getStatus() === 409);
    assert.equal(f.calls.signatures.length, 0); assert.equal(f.calls.audits.length, 0);
  }
});

test('review download lifetime never exceeds evidence expiry', async () => {
  const f = fixture({ expiresAt: new Date(Date.now() + 12000) });
  const result = await f.service.reviewDownload(f.organisationId, f.id, 'reviewer');
  assert.ok(result.expiresInSeconds > 0 && result.expiresInSeconds <= 12);
  assert.ok(Date.parse(result.expiresAt) <= f.evidence.expiresAt.getTime());
});

test('storage/signing errors are redacted and audit write failure prevents delivery of a signed link', async () => {
  for (const operation of ['head', 'createReviewDownloadUrl']) {
    const f = fixture(); f.storage[operation] = async () => { throw new Error('Synthetic confidential storage detail'); };
    await assert.rejects(f.service.reviewDownload(f.organisationId, f.id, 'reviewer'), error => {
      assert.equal(error.getResponse().code, 'EVIDENCE_REVIEW_DOWNLOAD_UNAVAILABLE');
      assert.equal(JSON.stringify(error.getResponse()).includes('confidential'), false); return true;
    });
    assert.equal(f.calls.audits.length, 0);
  }
  const f = fixture(); f.tx.auditEvent.create = async () => { throw new Error('Synthetic audit write failure'); };
  await assert.rejects(f.service.reviewDownload(f.organisationId, f.id, 'reviewer'), /Synthetic audit write failure/);
  assert.equal(f.evidence.verificationStatus, 'uploaded');
});

test('review download role policy allows only explicit reviewer roles', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, EvidenceController.prototype.reviewDownload), ['operator_admin', 'compliance_manager', 'service_provider_admin']);
});

test('S3 review URL pins a version, caps TTL and forces download/octet-stream with a safe filename', async () => {
  const storage = new StorageService(new ConfigService({ S3_BUCKET: 'synthetic', S3_REGION: 'eu-central-1',
    S3_ENDPOINT: 'http://127.0.0.1:59000', S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY: 'synthetic-access', S3_SECRET_KEY: 'synthetic-secret' }), {});
  const input = { objectKey: 'synthetic/source', versionId: 'immutable-v1', filename: 'evil"\r\nContent-Type: text/html.html', expiresIn: 60, issuedAt: new Date() };
  const url = new URL(await storage.createReviewDownloadUrl(input));
  assert.equal(url.searchParams.get('versionId'), 'immutable-v1');
  assert.equal(url.searchParams.get('response-content-type'), 'application/octet-stream');
  assert.equal(url.searchParams.get('response-cache-control'), 'private, no-store, max-age=0');
  assert.match(url.searchParams.get('response-content-disposition'), /^attachment; filename="[a-zA-Z0-9._-]+"$/);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
  await assert.rejects(storage.createReviewDownloadUrl({ ...input, versionId: '' }));
  await assert.rejects(storage.createReviewDownloadUrl({ ...input, expiresIn: 300 }));
});
