const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fields } = require('@eubp/rules');
const { BatteriesController } = require('../../apps/api/dist/modules/batteries/batteries.controller');
const { PassportDataService } = require('../../apps/api/dist/modules/passports/passport-data.service');
const { ROLES_KEY } = require('../../apps/api/dist/common/auth/roles.decorator');
const { ApplicabilityReviewSchema, assessConditionalReview, reviewedApplicabilityContext } = require('../../apps/api/dist/modules/batteries/applicability-review');
const { syntheticConditionalDecisions, syntheticReviewedApplicabilityContext } = require('../fixtures/conditional-applicability.cjs');

test('every battery category requires explicit current conditional decisions and a recorded authenticated review', () => {
  for (const category of ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH']) {
    const decisions = syntheticConditionalDecisions(category);
    assert.ok(decisions.length > 0);
    for (const context of [{}, { conditionalRequiredFieldIds: [] }, { conditionalRequiredFieldIds: [], conditionalDecisions: decisions }]) {
      const assessment = assessConditionalReview(category, context);
      assert.equal(assessment.complete, false);
      assert.ok(assessment.issues.length > 0);
    }
    const reviewed = assessConditionalReview(category, syntheticReviewedApplicabilityContext(category));
    assert.equal(reviewed.complete, true);
    assert.deepEqual(reviewed.unresolvedFieldIds, []);
    assert.equal(reviewed.fields.length, decisions.length);
    assert.ok(reviewed.fields.every(field => field.decision.applicable === false && field.decision.reason.length >= 10));
  }
});

test('missing, duplicate, non-conditional, malformed or mismatched decisions cannot pass the review gate', () => {
  const baseline = syntheticReviewedApplicabilityContext('EV');
  const first = baseline.conditionalDecisions[0];
  const changed = (edit) => { const context = structuredClone(baseline); edit(context); return assessConditionalReview('EV', context); };
  for (const assessment of [
    changed(context => context.conditionalDecisions.shift()),
    changed(context => context.conditionalDecisions.push(first)),
    changed(context => context.conditionalDecisions.push({ fieldId: 1, applicable: false, reason: 'Synthetic non-conditional field' })),
    changed(context => context.conditionalDecisions[0].applicable = 'false'),
    changed(context => context.conditionalDecisions[0].reason = '  '),
    changed(context => context.conditionalRequiredFieldIds = [first.fieldId]),
    changed(context => context.conditionalReview.category = 'LMT'),
    changed(context => context.conditionalReview.profileFingerprint = 'stale-profile'),
    changed(context => context.conditionalReview.reviewedBySubject = ''),
  ]) assert.equal(assessment.complete, false);
  assert.equal(ApplicabilityReviewSchema.safeParse({ decisions: [{ ...first, applicable: undefined }] }).success, false);
  assert.equal(ApplicabilityReviewSchema.safeParse({ decisions: [{ ...first, reason: '  short  ' }] }).success, false);
  assert.equal(ApplicabilityReviewSchema.safeParse({ decisions: [first], organisationId: 'spoof' }).success, false);
});

function aggregateFixture() {
  const evidence = { verificationStatus: 'verified', sha256: 'a'.repeat(64), expiresAt: null, issuedAt: null };
  const values = fields.filter(field => ['mandatory', 'mandatory_dynamic'].includes(field.applicability_2027_02_18.EV)).map(field => ({
    fieldDefinitionId: field.id, validationStatus: 'validated',
    valueJson: field.id === 67 ? 'original' : [10, 11, 26, 27, 28, 51].includes(field.id) ? 100 : `fixture-${field.id}`,
    evidenceLinks: [{ evidenceId: 'fixture-evidence', evidence }],
  }));
  const model = { id: 'model-A', organisationId: 'org-A', category: 'EV', applicabilityContext: {}, values };
  const item = { id: 'item-A', organisationId: 'org-A', model, values: [], lifecycleStatus: 'original', passportState: 'ready' };
  const calls = [], audits = [];
  const tx = {
    $queryRaw: async (query, modelId, organisationId) => {
      calls.push('lock'); assert.equal(modelId, 'model-A'); assert.equal(organisationId, 'org-A'); assert.ok(query.join('').includes('FOR UPDATE')); return [{ id: modelId }];
    },
    batteryModel: {
      findFirstOrThrow: async query => { calls.push('read'); assert.deepEqual(query.where, { id: 'model-A', organisationId: 'org-A' }); return model; },
      update: async query => { calls.push('update'); assert.equal(query.where.id, 'model-A'); model.applicabilityContext = query.data.applicabilityContext; return model; },
    },
    batteryItem: {
      findFirstOrThrow: async query => { assert.deepEqual(query.where, { id: 'item-A', organisationId: 'org-A' }); return item; },
      updateMany: async query => { calls.push('invalidate'); assert.equal(query.where.organisationId, 'org-A'); assert.equal(query.where.modelId, 'model-A'); return { count: 1 }; },
    },
    auditEvent: { create: async query => { calls.push('audit'); audits.push(query.data); return query.data; } },
  };
  const db = { run: async (orgId, callback) => { assert.equal(orgId, 'org-A'); return callback(tx); } };
  return { model, item, calls, audits, controller: new BatteriesController(db, {}), service: new PassportDataService(db) };
}

test('an actual locked and audited review makes unknown applicability checked; applicable decisions still require evidence-backed values', async () => {
  const fixture = aggregateFixture();
  const before = await fixture.service.validate('org-A', 'item-A');
  assert.equal(before.readiness.score, 100);
  assert.equal(before.publishable, false);
  assert.equal(before.conditionalReview.complete, false);
  assert.ok(before.publicationBlockers.some(issue => issue.rule === 'BP-APPLICABILITY-REVIEW'));
  const decisions = syntheticConditionalDecisions('EV');
  const saved = await fixture.controller.reviewApplicability('org-A', { subject: 'authenticated-reviewer' }, 'model-A', { decisions });
  assert.equal(saved.conditionalReview.complete, true);
  assert.deepEqual(fixture.calls.slice(-6), ['lock', 'read', 'update', 'invalidate', 'invalidate', 'audit']);
  assert.equal(fixture.audits[0].actorSubject, 'authenticated-reviewer');
  assert.equal(fixture.audits[0].action, 'battery_model.applicability_review');
  assert.deepEqual(fixture.audits[0].metadata.decisions, decisions);
  const after = await fixture.service.validate('org-A', 'item-A');
  assert.equal(after.publishable, true);
  assert.equal(after.readiness.conditionalOpen, 0);
  decisions[0].applicable = true;
  await fixture.controller.reviewApplicability('org-A', { subject: 'authenticated-reviewer' }, 'model-A', { decisions });
  const required = await fixture.service.validate('org-A', 'item-A');
  assert.equal(required.conditionalReview.complete, true);
  assert.equal(required.publishable, false);
  assert.ok(required.publicationBlockers.some(issue => issue.rule === 'BP-REQUIRED' && issue.fieldId === decisions[0].fieldId));
  fixture.model.applicabilityContext.conditionalRequiredFieldIds = [];
  assert.ok((await fixture.service.validate('org-A', 'item-A')).publicationBlockers.some(issue => issue.rule === 'BP-APPLICABILITY-REVIEW'));
});

test('the review endpoint rejects incomplete reviews before any mutation and model creation cannot forge reviewed metadata', async () => {
  const fixture = aggregateFixture();
  const before = structuredClone(fixture.model.applicabilityContext);
  await assert.rejects(fixture.controller.reviewApplicability('org-A', { subject: 'reviewer' }, 'model-A', { decisions: [] }), error => error.getStatus() === 400);
  assert.deepEqual(fixture.model.applicabilityContext, before);
  assert.deepEqual(fixture.audits, []);
  assert.deepEqual(fixture.calls, ['lock', 'read']);
  for (const applicabilityContext of [
    { conditionalDecisions: syntheticConditionalDecisions('EV') },
    { conditionalReview: { reviewedBySubject: 'forged', reviewedAt: new Date().toISOString() } },
  ]) await assert.rejects(fixture.controller.createModel('org-A', { subject: 'reviewer' }, { modelIdentifier: 'forged', category: 'EV', applicabilityContext }));
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, BatteriesController.prototype.reviewApplicability), ['operator_admin', 'compliance_manager', 'service_provider_admin']);
});
