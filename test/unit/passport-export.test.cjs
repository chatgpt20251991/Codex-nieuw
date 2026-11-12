'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const syntheticExport = require('../fixtures/operator-export.cjs');
const { verifyManifest } = require('../../scripts/passport-export.cjs');
const { PassportExportService, OPERATOR_EXPORT_MAX_BYTES } = require('../../apps/api/dist/modules/passports/passport-export.service');
const { PassportExportController } = require('../../apps/api/dist/modules/passports/passport-export.controller');
const { ROLES_KEY } = require('../../apps/api/dist/common/auth/roles.decorator');
const { AUTHORISATION_SCOPE_KEY } = require('../../apps/api/dist/common/tenant/authorisation-scope.decorator');

function fixture() {
  const { envelope } = syntheticExport(), { organisation, model, item, versions, evidence } = envelope.payload;
  const calls = { audits: [], tenant: [], evidence: [] };
  const tx = { $queryRaw: async strings => String(strings[0]).includes('COUNT(*)')
    ? [{ count: 2n, bytes: 1500n }] : [{ id: 'locked' }],
    organisation: { findFirstOrThrow: async () => organisation },
    batteryItem: { findFirstOrThrow: async query => { assert.deepEqual(query.where, { id: item.id, organisationId: organisation.id }); return item; } },
    batteryModel: { findFirstOrThrow: async () => model },
    passportVersion: { findMany: async query => { assert.deepEqual(query.where, { organisationId: organisation.id, batteryItemId: item.id }); return versions; } },
    evidenceObject: { findMany: async query => { calls.evidence.push(query); return evidence.map(row => ({ ...row, sizeBytes: BigInt(row.sizeBytes) })); } },
    auditEvent: { create: async data => { calls.audits.push(data.data); } } };
  const service = new PassportExportService({ run: async (org, action) => { calls.tenant.push(org); return action(tx); } });
  return { service, tx, calls, organisation, item, versions };
}

test('private export scopes all reads to tenant, retains unchanged immutable hashes and records issuance without changing passport state', async () => {
  const f = fixture(), before = structuredClone(f.versions);
  const result = await f.service.export(f.organisation.id, f.item.id, 'synthetic-reviewer');
  assert.equal(verifyManifest(result).versionCount, 2); assert.deepEqual(f.versions, before);
  assert.deepEqual(f.calls.tenant, [f.organisation.id]); assert.equal(f.calls.evidence[0].where.organisationId, f.organisation.id);
  assert.equal(f.calls.audits.length, 1); const event = f.calls.audits[0];
  assert.equal(event.actorSubject, 'synthetic-reviewer'); assert.equal(event.action, 'passport.operator_export_issued');
  assert.equal(event.metadata.payloadSha256, result.integrity.payloadSha256);
  assert.equal(event.metadata.completeCustomerExitArchive, false);
  for (const secret of ['objectKey', 'tokenHash', 'downloadUrl', 'legalRepresentativeEmail', 'requestJson']) {
    assert.equal(Object.hasOwn(f.calls.evidence[0].select, secret), false);
    assert.equal(JSON.stringify(result).includes('"' + secret + '"'), false);
  }
});

test('export rejects missing, corrupt or oversized history before issuing an audit record', async () => {
  for (const [change, code] of [
    [f => { f.tx.$queryRaw = async strings => String(strings[0]).includes('COUNT(*)') ? [{ count: 0n, bytes: 0n }] : [{ id: 'locked' }]; }, 'EXPORT_PUBLICATION_REQUIRED'],
    [f => { f.versions[0].sha256 = '0'.repeat(64); }, 'EXPORT_VERSION_INTEGRITY_FAILED'],
    [f => { f.versions[1].previousVersionHash = null; }, 'EXPORT_VERSION_INTEGRITY_FAILED'],
    [f => { f.tx.$queryRaw = async strings => String(strings[0]).includes('COUNT(*)') ? [{ count: 257n, bytes: 1500n }] : [{ id: 'locked' }]; }, 'EXPORT_LIMIT_EXCEEDED'],
    [f => { f.tx.$queryRaw = async strings => String(strings[0]).includes('COUNT(*)') ? [{ count: 2n, bytes: BigInt(OPERATOR_EXPORT_MAX_BYTES + 1) }] : [{ id: 'locked' }]; }, 'EXPORT_LIMIT_EXCEEDED'],
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(f.service.export(f.organisation.id, f.item.id, 'reviewer'), error => error.getResponse().code === code);
    assert.equal(f.calls.audits.length, 0);
  }
});

test('private export role and delegated scope are explicit, and an audit failure prevents delivery', async () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PassportExportController.prototype.export), ['operator_admin', 'compliance_manager', 'service_provider_admin']);
  assert.equal(Reflect.getMetadata(AUTHORISATION_SCOPE_KEY, PassportExportController.prototype.export), 'passportExport');
  const f = fixture(); f.tx.auditEvent.create = async () => { throw new Error('Synthetic audit failure'); };
  await assert.rejects(f.service.export(f.organisation.id, f.item.id, 'reviewer'), /Synthetic audit failure/);
});

test('missing referenced evidence is explicitly reported without filling it from another tenant or inventing source availability', async () => {
  const f = fixture(); f.tx.evidenceObject.findMany = async query => {
    assert.equal(query.where.organisationId, f.organisation.id); return [];
  };
  const result = await f.service.export(f.organisation.id, f.item.id, 'reviewer');
  const expected = [...new Set(f.versions.flatMap(v => v.canonicalJson.values.flatMap(value => value.evidenceIds)))].sort();
  assert.deepEqual(result.payload.coverage.missingEvidenceIds, expected);
  assert.deepEqual(verifyManifest(result).missingEvidenceMetadata, expected);
  assert.equal(result.payload.coverage.sourceDocumentBytesIncluded, false);
  assert.equal(result.payload.coverage.completeCustomerExitArchive, false);
});
