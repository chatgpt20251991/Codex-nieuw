'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../../apps/api/dist/common/auth/roles.guard');
const { ROLES_KEY } = require('../../apps/api/dist/common/auth/roles.decorator');
const { AUTHORISATION_SCOPE_KEY } = require('../../apps/api/dist/common/tenant/authorisation-scope.decorator');
const { AuthorisationsController } = require('../../apps/api/dist/modules/authorisations/authorisations.controller');
const { currentAuthorisationEvidence } = require('../../apps/api/dist/modules/authorisations/authorisation-evidence');
const { projectAuthorisation } = require('../../apps/api/dist/modules/authorisations/authorisation-view');
const { EvidenceController } = require('../../apps/api/dist/modules/evidence/evidence.controller');

const org = '11111111-1111-4111-8111-111111111111';
const provider = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const grantId = '44444444-4444-4444-8444-444444444444';
const actor = { subject: 'synthetic-owner', organisationId: org, role: 'operator_admin', mode: 'oidc' };
const safeKeys = ['id', 'responsibleOperatorId', 'serviceProviderId', 'scopeJson', 'validFrom',
  'validUntil', 'revokedAt', 'createdAt', 'scopeValid'].sort();

function source(now = Date.now()) {
  const sha256 = 'a'.repeat(64);
  return { id: evidenceId, organisationId: org, objectKey: `orgs/${org}/evidence/${evidenceId}/mandate.pdf`,
    originalFilename: 'synthetic-mandate.pdf', mimeType: 'application/pdf', sizeBytes: 5n,
    sha256, storageChecksum: Buffer.from(sha256, 'hex').toString('base64'), storageVersionId: 'immutable-source-v1',
    malwareScanSha256: sha256, malwareScannedAt: new Date(now - 6000),
    malwareScannerVersion: 'ClamAV 1.4.6/12345/Thu Nov 12 08:00:00 2026',
    verificationStatus: 'verified', issuedAt: null, expiresAt: null, uploadedAt: new Date(now - 5000) };
}
function fixture() {
  const evidence = source();
  const grant = { id: grantId, responsibleOperatorId: org, serviceProviderId: provider,
    scopeJson: { modelRead: true }, validFrom: new Date(Date.now() - 10000), validUntil: null,
    revokedAt: null, createdAt: new Date(Date.now() - 10000),
    documentObjectKey: 'PRIVATE_STORAGE_LOCATOR', documentSha256: 'PRIVATE_DOCUMENT_HASH' };
  const calls = { tenants: [], operations: [], creates: [], updates: [], audits: [], queries: [] };
  const tx = {
    $queryRaw: async (strings, ...parameters) => { calls.operations.push('lock'); calls.queries.push({ sql: strings.join('?'), parameters }); return [{ id: grantId }]; },
    evidenceObject: {
      findFirstOrThrow: async query => { calls.operations.push('evidence'); assert.deepEqual(query.where, { id: evidenceId, organisationId: org }); return evidence; },
      findMany: async query => { calls.queries.push(query); return [evidence]; },
    },
    writtenAuthorisation: {
      findMany: async query => { calls.queries.push(query); return [grant]; },
      findFirstOrThrow: async query => { calls.operations.push('grant'); assert.deepEqual(query.where, { id: grantId, responsibleOperatorId: org }); return grant; },
      create: async query => { calls.operations.push('create'); calls.creates.push(query); return { ...grant, ...query.data }; },
      update: async query => { calls.operations.push('update'); calls.updates.push(query); Object.assign(grant, query.data); return grant; },
    },
    auditEvent: { create: async query => { calls.operations.push('audit'); calls.audits.push(query.data); return query.data; } },
  };
  const db = { run: async (tenant, action) => { calls.tenants.push(tenant); assert.equal(tenant, org); return action(tx); } };
  return { evidence, grant, calls, tx, db, controller: new AuthorisationsController(db) };
}
const body = { serviceProviderId: provider, evidenceId, scope: { modelRead: true } };

test('authorisation management is own-tenant/admin only and projects legacy grants without storage metadata', async () => {
  assert.equal(Reflect.getMetadata(AUTHORISATION_SCOPE_KEY, AuthorisationsController), null);
  for (const method of ['list', 'create', 'revoke']) {
    const handler = AuthorisationsController.prototype[method];
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), ['operator_admin']);
    const context = role => ({ getHandler: () => handler, getClass: () => AuthorisationsController,
      switchToHttp: () => ({ getRequest: () => ({ actor: { ...actor, role } }) }) });
    const guard = new RolesGuard(new Reflector());
    assert.equal(guard.canActivate(context('operator_admin')), true);
    for (const role of ['operator_user', 'compliance_manager', 'service_provider_admin']) {
      assert.throws(() => guard.canActivate(context(role)), error => error.getStatus() === 403);
    }
  }
  const f = fixture(); f.grant.scopeJson = { passportManagement: true };
  const rows = await f.controller.list(org);
  assert.equal(rows[0].scopeValid, false); assert.deepEqual(Object.keys(rows[0]).sort(), safeKeys);
  assert.deepEqual(rows[0].scopeJson, {}, 'Invalid legacy JSON is not copied into management responses');
  assert.equal(JSON.stringify(rows).includes('PRIVATE_'), false);
  const query = f.calls.queries[0];
  assert.deepEqual(query.where, { responsibleOperatorId: org }); assert.equal(query.take, 100);
  assert.equal(query.select.documentObjectKey, undefined); assert.equal(query.select.documentSha256, undefined);
  assert.equal(projectAuthorisation({ ...f.grant, scopeJson: { passportExport: true } }).scopeValid, true);
});

test('grant and evidence inventories are bounded and cursor-paginated without changing tenant scope', async () => {
  const f = fixture();
  await f.controller.list(org, { limit: '12', cursor: grantId });
  assert.equal(f.calls.queries[0].take, 12); assert.equal(f.calls.queries[0].skip, 1);
  assert.deepEqual(f.calls.queries[0].cursor, { id: grantId });
  assert.deepEqual(f.calls.queries[0].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  const controller = new EvidenceController(f.db, {}, {});
  assert.equal(Reflect.getMetadata(AUTHORISATION_SCOPE_KEY, EvidenceController.prototype.list), 'evidenceRead');
  const rows = await controller.list(org, { limit: '2', cursor: evidenceId });
  assert.deepEqual(f.calls.queries[1].where, { organisationId: org }); assert.equal(f.calls.queries[1].take, 2);
  assert.deepEqual(f.calls.queries[1].cursor, { id: evidenceId });
  assert.equal(rows[0].sizeBytes, '5'); assert.equal(rows[0].eligibleForAuthorisation, true);
  assert.equal(rows[0].verifiedAt, null, 'A legacy verification timestamp must not be invented');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['id', 'originalFilename', 'mimeType', 'sizeBytes',
    'verificationStatus', 'uploadedAt', 'verifiedAt', 'expiresAt', 'issuedAt', 'eligibleForAuthorisation'].sort());
  for (const key of ['objectKey', 'sha256', 'storageChecksum', 'storageVersionId', 'malwareScannerVersion', 'downloadUrl']) {
    assert.equal(Object.hasOwn(rows[0], key), false);
  }
  for (const query of [{ limit: '101' }, { limit: '0' }, { limit: '1.2' }, { limit: 'no' },
    { cursor: 'not-a-uuid' }, { organisationId: provider }]) {
    await assert.rejects(f.controller.list(org, query)); await assert.rejects(controller.list(org, query));
  }
  f.evidence.verificationStatus = 'uploaded';
  assert.equal((await controller.list(org))[0].eligibleForAuthorisation, false);
});

test('new grants bind the current locked source, explicit scopes and atomic audit; every response stays projected', async () => {
  const f = fixture(); const row = await f.controller.create(org, actor, body);
  assert.deepEqual(f.calls.operations, ['lock', 'evidence', 'create', 'audit']);
  assert.match(f.calls.queries[0].sql, /EvidenceObject[\s\S]*organisationId[\s\S]*FOR SHARE/);
  assert.deepEqual(f.calls.queries[0].parameters, [evidenceId, org]);
  const saved = f.calls.creates[0];
  assert.equal(saved.data.documentSha256, f.evidence.sha256); assert.equal(saved.data.documentObjectKey, f.evidence.objectKey);
  assert.deepEqual(saved.data.scopeJson, { modelRead: true });
  assert.deepEqual(Object.keys(row).sort(), safeKeys); assert.equal(row.scopeValid, true);
  assert.equal(JSON.stringify(row).includes('PRIVATE_'), false);
  assert.equal(f.calls.audits[0].action, 'authorisation.create');
  assert.equal(f.calls.audits[0].actorSubject, actor.subject); assert.deepEqual(f.calls.audits[0].metadata.scope, body.scope);
});

test('a verified label cannot substitute for a current complete immutable clean-scan attestation', async () => {
  const now = Date.now(), base = source(now);
  assert.equal(currentAuthorisationEvidence(base, org, evidenceId, now), true);
  for (const change of [
    { verificationStatus: 'uploaded' }, { verificationStatus: 'rejected' },
    { expiresAt: new Date(now) }, { issuedAt: new Date(now + 60000) }, { issuedAt: new Date(NaN) },
    { expiresAt: new Date(NaN) }, { sha256: null }, { sha256: 'bad' },
    { malwareScanSha256: null }, { malwareScanSha256: 'b'.repeat(64) },
    { malwareScannedAt: null }, { malwareScannedAt: new Date(now + 60000) },
    { malwareScannerVersion: null }, { malwareScannerVersion: 'unverified scanner' }, { malwareScannerVersion: 'ClamAV fixture' },
    { storageVersionId: null }, { storageVersionId: 'null' }, { storageVersionId: ' ' }, { storageVersionId: ' null ' },
    { storageChecksum: null }, { storageChecksum: 'different-checksum' },
    { sizeBytes: 0n }, { sizeBytes: 100n * 1024n * 1024n + 1n },
    { uploadedAt: null }, { uploadedAt: new Date(now + 60000) },
    { objectKey: 'foreign/source.pdf' }, { organisationId: provider }, { id: grantId },
  ]) {
    assert.equal(currentAuthorisationEvidence({ ...base, ...change }, org, evidenceId, now), false,
      `Unsafe attestation accepted: ${Object.keys(change).join(',')}`);
    const f = fixture(); Object.assign(f.evidence, base, change);
    await assert.rejects(f.controller.create(org, actor, body), error =>
      error.getResponse().code === 'VERIFIED_AUTHORISATION_EVIDENCE_REQUIRED');
    assert.equal(f.calls.creates.length, 0); assert.equal(f.calls.audits.length, 0);
  }
});

test('source invalidation before the shared lock is reread and blocks issuance without a success audit', async () => {
  const f = fixture();
  f.tx.$queryRaw = async () => { f.calls.operations.push('lock'); f.evidence.verificationStatus = 'superseded'; return [{ id: evidenceId }]; };
  await assert.rejects(f.controller.create(org, actor, body), error =>
    error.getResponse().code === 'VERIFIED_AUTHORISATION_EVIDENCE_REQUIRED');
  assert.deepEqual(f.calls.operations, ['lock', 'evidence']); assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.audits.length, 0);
});

test('grant creation rejects injected fields, malformed scopes, foreign actors and invalid validity before accessing data', async () => {
  for (const invalid of [{ ...body, responsibleOperatorId: provider }, { ...body, documentObjectKey: 'injected' },
    { ...body, scope: { passportManagement: true } }, { ...body, scope: { modelRead: 'true' } },
    { ...body, scope: { modelRead: false } }, { ...body, serviceProviderId: 'bad-id' },
    { ...body, evidenceId: 'bad-id' }, { ...body, serviceProviderId: org },
    { ...body, validFrom: '2026-11-12T10:00:00Z', validUntil: '2026-11-12T09:00:00Z' }]) {
    const f = fixture(); await assert.rejects(f.controller.create(org, actor, invalid));
    assert.equal(f.calls.tenants.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.controller.create(org, { ...actor, organisationId: provider }, body), error => error.getStatus() === 403);
  assert.equal(f.calls.tenants.length, 0);
  f.tx.auditEvent.create = async () => { throw new Error('Synthetic audit failure'); };
  await assert.rejects(f.controller.create(org, actor, body), /Synthetic audit failure/);
});

test('new permission intervals cannot outlive an expiring source or start after it expires', async () => {
  const expires = new Date(Date.now() + 60000);
  for (const interval of [{}, { validUntil: new Date(expires.getTime() + 1).toISOString() },
    { validFrom: expires.toISOString(), validUntil: new Date(expires.getTime() + 60000).toISOString() }]) {
    const f = fixture(); f.evidence.expiresAt = expires;
    await assert.rejects(f.controller.create(org, actor, { ...body, ...interval }),
      error => error.getResponse().code === 'AUTHORISATION_EXCEEDS_EVIDENCE_VALIDITY');
    assert.equal(f.calls.creates.length, 0); assert.equal(f.calls.audits.length, 0);
  }
  const f = fixture(); f.evidence.expiresAt = expires;
  const row = await f.controller.create(org, actor, { ...body, validUntil: expires.toISOString() });
  assert.equal(row.validUntil.toISOString(), expires.toISOString());
});

test('revocation locks the exact own grant and repeated requests retain the first timestamp and single audit', async () => {
  const f = fixture(); const first = await f.controller.revoke(org, actor, grantId);
  assert.match(f.calls.queries[0].sql, /WrittenAuthorisation[\s\S]*responsibleOperatorId[\s\S]*FOR UPDATE/);
  assert.deepEqual(f.calls.queries[0].parameters, [grantId, org]);
  assert.deepEqual(f.calls.operations, ['lock', 'grant', 'update', 'audit']);
  const second = await f.controller.revoke(org, actor, grantId);
  assert.equal(second.revokedAt, first.revokedAt); assert.deepEqual(Object.keys(second).sort(), safeKeys);
  assert.equal(f.calls.updates.length, 1); assert.equal(f.calls.audits.length, 1);
  assert.equal(f.calls.audits[0].action, 'authorisation.revoke'); assert.equal(JSON.stringify(second).includes('PRIVATE_'), false);
  const invalid = fixture();
  await assert.rejects(invalid.controller.revoke(org, actor, 'not-a-uuid'));
  await assert.rejects(invalid.controller.revoke(org, { ...actor, organisationId: provider }, grantId), error => error.getStatus() === 403);
  assert.equal(invalid.calls.tenants.length, 0);
});
