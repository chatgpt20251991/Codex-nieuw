const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fields } = require('@eubp/rules');
const { ComplianceController } = require('../../apps/api/dist/modules/compliance/compliance.controller');
const { PassportDataService } = require('../../apps/api/dist/modules/passports/passport-data.service');

function fixture(evidenceOverrides = {}, itemOverrides = {}) {
  const evidence = { id: 'private-evidence', verificationStatus: 'verified', expiresAt: null, issuedAt: null,
    sha256: 'a'.repeat(64), malwareScanSha256: 'a'.repeat(64), malwareScannedAt: new Date(),
    malwareScannerVersion: 'synthetic-scanner', storageVersionId: 'private-storage-version',
    objectKey: 'private/object-key', ...evidenceOverrides };
  const values = fields.filter(f => ['mandatory', 'mandatory_dynamic'].includes(f.applicability_2027_02_18.EV)).map(f => ({
    fieldDefinitionId: f.id, validationStatus: 'validated',
    valueJson: f.id === 67 ? 'original' : [10, 11, 26, 27, 28, 51].includes(f.id) ? 100 : `private-value-${f.id}`,
    evidenceLinks: [{ evidenceId: evidence.id, evidence }],
  }));
  values.push({ fieldDefinitionId: 50, validationStatus: 'validated', valueJson: 'authority-only-test-value',
    evidenceLinks: [{ evidenceId: evidence.id, evidence }] });
  const model = { id: 'model-A', organisationId: 'org-A', category: 'EV', applicabilityContext: {}, values };
  const item = { id: 'item-A', organisationId: 'org-A', model, values: [], lifecycleStatus: 'original',
    passportState: 'published', ...itemOverrides };
  const queries = [];
  const tx = {
    batteryModel: { findFirstOrThrow: async query => { queries.push(query); assert.equal(query.where.organisationId, 'org-A'); return model; } },
    batteryItem: { findFirstOrThrow: async query => { queries.push(query); assert.equal(query.where.organisationId, 'org-A'); return item; } },
  };
  const db = { run: async (orgId, callback) => { assert.equal(orgId, 'org-A'); return callback(tx); } };
  const service = new PassportDataService(db);
  return { evidence, model, item, queries, controller: new ComplianceController(service), service };
}

test('readiness summaries count only evidence that is presently usable for publication', async () => {
  const cases = [
    { verificationStatus: 'uploaded' }, { verificationStatus: 'rejected' }, { verificationStatus: 'superseded' },
    { expiresAt: new Date(Date.now() - 1000) }, { issuedAt: new Date(Date.now() + 60000) },
  ];
  for (const overrides of cases) {
    const f = fixture(overrides);
    const item = await f.controller.itemReadiness('org-A', 'item-A');
    const model = await f.controller.modelReadiness('org-A', 'model-A');
    const publication = await f.service.validate('org-A', 'item-A');
    assert.equal(item.verified, 0);
    assert.equal(model.verified, 0);
    assert.equal(item.complete, item.required);
    assert.equal(item.publishable, false);
    assert.deepEqual(item.publicationBlockers, publication.publicationBlockers);
    assert.ok(item.publicationBlockers.some(blocker => blocker.rule === 'BP-EVIDENCE'));
    for (const query of f.queries) {
      const selection = query.include.values || query.include.model.include.values;
      assert.deepEqual(selection.where, { validUntil: null, validationStatus: { not: 'superseded' } });
      assert.deepEqual(selection.include.evidenceLinks, { include: { evidence: true } });
    }
  }
});

test('production readiness does not accept unscanned or mismatched evidence as verified', async () => {
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const overrides of [{ malwareScannedAt: null }, { malwareScanSha256: 'b'.repeat(64) }, { storageVersionId: null }]) {
      const f = fixture(overrides);
      assert.equal((await f.controller.itemReadiness('org-A', 'item-A')).verified, 0);
      assert.equal((await f.controller.modelReadiness('org-A', 'model-A')).verified, 0);
    }
    const f = fixture();
    assert.equal((await f.controller.itemReadiness('org-A', 'item-A')).publishable, true);
  } finally {
    if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior;
  }
});

test('100 percent complete data still reports voltage and lifecycle publication blockers', async () => {
  const f = fixture();
  f.model.values.find(value => value.fieldDefinitionId === 26).valueJson = 300;
  const voltage = await f.controller.itemReadiness('org-A', 'item-A');
  assert.equal(voltage.score, 100);
  assert.equal(voltage.verified, voltage.required);
  assert.equal(voltage.publishable, false);
  assert.ok(voltage.crossChecks.some(issue => issue.rule === 'BP-X001'));
  assert.ok(voltage.publicationBlockers.some(issue => issue.rule === 'BP-X001'));
  const closed = fixture({}, { lifecycleStatus: 'recycled', passportState: 'recycled' });
  const report = await closed.controller.itemReadiness('org-A', 'item-A');
  assert.equal(report.publishable, false);
  assert.ok(report.publicationBlockers.some(issue => issue.rule === 'BP-LIFECYCLE-CLOSED'));
  assert.ok(report.publicationBlockers.some(issue => issue.rule === 'BP-LIFECYCLE-STATUS'));
});

test('read-only summaries retain tenant scope, current model/item overrides and exclude raw passport/evidence data', async () => {
  const f = fixture();
  f.item.values = [{ fieldDefinitionId: 11, validationStatus: 'unvalidated', valueJson: 90, evidenceLinks: [] }];
  const before = JSON.stringify(f.item);
  const report = await f.controller.itemReadiness('org-A', 'item-A');
  assert.equal(report.verified, report.required - 1);
  assert.equal(report.publishable, false);
  assert.equal(JSON.stringify(f.item), before);
  assert.equal('item' in report, false);
  assert.equal('values' in report, false);
  const serialized = JSON.stringify(report);
  for (const value of ['authority-only-test-value', 'private-evidence', 'private/object-key', 'private-storage-version']) {
    assert.equal(serialized.includes(value), false);
  }
  assert.deepEqual(f.queries[0].where, { id: 'item-A', organisationId: 'org-A' });
  await assert.rejects(f.controller.itemReadiness('org-B', 'item-A'));
});
