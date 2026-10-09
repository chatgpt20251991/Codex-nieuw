'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PROFILE, createIndustrialAssessment, evaluateIndustrialAssessment } = require('./customer-readiness-assessment.cjs');

function model(extra = {}) {
  return createIndustrialAssessment({ model_id: 'MODEL-001', category: 'INDUSTRIAL', rechargeable: true,
    rated_energy_kwh: 120, exclusively_external_storage: false, finished_battery: true,
    intended_application: 'Stationary storage', ...extra });
}
function completeReview(record) {
  record.review = { applicability_decision: 'in_scope', reason: 'Documented model and scope assessment',
    reviewer: 'reviewer-1', reviewed_at: '2026-10-09', evidence_refs: ['REPORT-001'] };
  record.evidence = [{ evidence_id: 'REPORT-001', model_id: 'MODEL-001',
    content_sha256: 'a'.repeat(64), byte_integrity_status: 'verified',
    review_status: 'reviewed', reviewer: 'reviewer-2', reviewed_at: '2026-10-09' }];
  return record;
}

test('blank dossier preserves unknown applicability, draft status and separate deadlines', () => {
  const record = createIndustrialAssessment();
  const result = evaluateIndustrialAssessment(record);
  assert.equal(result.article10_scope_indicator, 'unresolved');
  assert.equal(result.passport_scope_indicator, 'unresolved');
  assert.equal(result.applicability_decision, null);
  assert.equal(result.review_status, 'requires_case_review');
  assert.ok(result.unknown_scope_inputs.includes('rechargeable'));
  assert.ok(result.unknown_scope_inputs.includes('exclusively_external_storage'));
  assert.equal(record.status, 'draft');
  assert.equal(record.profile, PROFILE);
  assert.equal(record.legal_context.passport.deadline, '2027-02-18');
  assert.equal(record.legal_context.industrial_performance.minimum_requirement_application_date, null);
  assert.equal(record.legal_context.industrial_performance.minimum_values, null);
});

test('industrial energy strictly greater than 2 kWh is a candidate, exact threshold is not', () => {
  for (const energy of [0.1, 1.9, 2]) {
    const result = evaluateIndustrialAssessment(model({ rated_energy_kwh: energy }));
    assert.equal(result.article10_scope_indicator, 'at_or_below_2_kwh');
    assert.equal(result.passport_scope_indicator, 'industrial_energy_threshold_not_exceeded');
    assert.equal(result.applicability_decision, null);
  }
  const result = evaluateIndustrialAssessment(model({ rated_energy_kwh: 2.001 }));
  assert.equal(result.article10_scope_indicator, 'minimum_performance_scope_candidate');
  assert.equal(result.passport_scope_indicator, 'passport_scope_candidate');
});

test('category label cannot override energy, and invalid numeric energy stays unknown', () => {
  assert.equal(evaluateIndustrialAssessment(model({ category: 'INDUSTRIAL_GT_2KWH', rated_energy_kwh: 2 })).article10_scope_indicator, 'at_or_below_2_kwh');
  for (const energy of [null, undefined, '120', 0, -3, NaN, Infinity]) {
    const result = evaluateIndustrialAssessment(model({ rated_energy_kwh: energy }));
    assert.equal(result.article10_scope_indicator, 'unresolved');
    assert.equal(result.passport_scope_indicator, 'unresolved');
    assert.ok(result.unknown_scope_inputs.includes('rated_energy_kwh'));
  }
});

test('external-only storage exception never exempts an industrial passport candidate', () => {
  const result = evaluateIndustrialAssessment(model({ exclusively_external_storage: true }));
  assert.equal(result.article10_scope_indicator, 'external_storage_exception_candidate');
  assert.equal(result.article10_documentation_scope_indicator, 'industrial_performance_documentation_candidate');
  assert.equal(result.passport_scope_indicator, 'passport_scope_candidate');
  assert.equal(result.applicability_decision, null);
  assert.equal(result.validated, false);
});

test('unknown external storage does not suppress separate current performance-document review', () => {
  const result = evaluateIndustrialAssessment(model({ exclusively_external_storage: null }));
  assert.equal(result.article10_scope_indicator, 'unresolved');
  assert.equal(result.article10_documentation_scope_indicator, 'industrial_performance_documentation_candidate');
  assert.equal(result.review_status, 'requires_case_review');
});

test('non-rechargeable industrial scope does not automatically exempt the passport', () => {
  const result = evaluateIndustrialAssessment(model({ rechargeable: false }));
  assert.equal(result.article10_scope_indicator, 'not_rechargeable');
  assert.equal(result.passport_scope_indicator, 'passport_scope_candidate');
});

test('EV and LMT are not classified as industrial performance candidates', () => {
  for (const category of ['EV', 'LMT']) {
    const result = evaluateIndustrialAssessment(model({ category, rated_energy_kwh: 0.5 }));
    assert.equal(result.article10_scope_indicator, 'not_industrial_category');
    assert.equal(result.passport_scope_indicator, 'passport_scope_candidate');
  }
});

test('unknown category or boolean text is not silently converted to an exemption', () => {
  for (const scope of [{ category: 'battery' }, { rechargeable: 'false' }, { exclusively_external_storage: 'false' }]) {
    const result = evaluateIndustrialAssessment(model(scope));
    assert.equal(result.article10_scope_indicator, 'unresolved');
    assert.equal(result.review_status, 'requires_case_review');
  }
});

test('claimed compliance and validation without review never become trusted results', () => {
  const record = model();
  record.status = 'validated';
  record.product_performance_conformity = 'compliant';
  record.legal_context.industrial_performance.minimum_values = { invented: 42 };
  record.review.applicability_decision = 'in_scope';
  record.measurements[0].validated = true;
  const result = evaluateIndustrialAssessment(record);
  assert.equal(result.validated, false);
  assert.equal(result.minimum_values_applied, false);
  assert.equal(result.product_performance_conformity, 'not_assessed');
  assert.equal(result.applicability_decision, null);
  assert.equal(result.review_status, 'requires_case_review');
  assert.ok(result.review_metadata_gaps.includes('reviewer'));
});

test('review requires model-matched unique evidence, reviewer and real byte-integrity metadata', () => {
  for (const [alter, expected] of [
    [record => { record.evidence[0].model_id = 'OTHER-MODEL'; }, 'evidence:REPORT-001:model_mismatch'],
    [record => { record.evidence[0].byte_integrity_status = 'not_verified'; }, 'evidence:REPORT-001:byte_integrity_unverified'],
    [record => { record.evidence[0].reviewer = null; }, 'evidence:REPORT-001:review_missing'],
    [record => { record.evidence[0].content_sha256 = 'not-a-hash'; }, 'evidence:REPORT-001:hash_missing'],
    [record => { record.evidence.push({ ...record.evidence[0] }); }, 'evidence:REPORT-001:missing_or_duplicate'],
  ]) {
    const record = completeReview(model()); alter(record);
    const result = evaluateIndustrialAssessment(record);
    assert.equal(result.review_status, 'requires_case_review');
    assert.ok(result.review_metadata_gaps.includes(expected));
    assert.equal(result.validated, false);
  }
});

test('complete offline review metadata still requires actual verification and no conformity claim', () => {
  const result = evaluateIndustrialAssessment(completeReview(model()));
  assert.equal(result.review_status, 'review_metadata_complete_requires_verification');
  assert.equal(result.suggested_reviewer_decision, 'in_scope');
  assert.equal(result.applicability_decision, null);
  assert.equal(result.product_performance_conformity, 'not_assessed');
  assert.equal(result.validated, false);
  assert.equal(result.registry_registered, false);
});

test('invalid calendar date cannot complete review metadata', () => {
  const record = completeReview(model());
  record.review.reviewed_at = '2026-02-31';
  const result = evaluateIndustrialAssessment(record);
  assert.ok(result.review_metadata_gaps.includes('reviewed_at'));
  assert.equal(result.review_status, 'requires_case_review');
});

test('generator preserves all category requirements, private projection and false Registry gates', () => {
  const root = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/customer-readiness.cjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const generated = name => JSON.parse(fs.readFileSync(path.join(root, 'docs/customer-readiness/generated', name), 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/02_71_DATA_POINTS.json'), 'utf8'));
  const checklists = generated('checklists.json');
  assert.equal(checklists.checklists.length, 3);
  for (const p of checklists.checklists) {
    assert.equal(p.profile, PROFILE);
    assert.equal(p.fields.length, 71);
    for (const f of p.fields) {
      const source = baseline.fields.find(b => b.id === f.field_id);
      assert.equal(f.baseline_requirement, source.applicability_2027_02_18[p.category]);
      assert.equal(f.access_tier, source.access_tier);
      assert.equal(f.status, 'not_reviewed');
      assert.equal(f.applicability_decision, null);
    }
  }
  const example = generated('example-dossier.json');
  assert.equal(example.fictional, true);
  assert.ok(example.values.every(v => v.validated === false));
  assert.equal(example.registry.submission_available, false);
  assert.equal(example.registry.uploadable, false);
  assert.equal(example.registry.external_registration_id, null);
  const publicProjection = generated('example-public-projection.json');
  assert.ok(publicProjection.values.every(v => baseline.fields.find(f => f.id === v.fieldId).access_tier === 'public'));
  assert.equal('industrial_model_assessment' in publicProjection, false);
  assert.equal('evidence' in publicProjection, false);
  const template = generated('industrial-model-assessment-template.json');
  assert.ok(template.measurements.every(m => !m.validated && m.value === null));
  assert.equal(template.review.applicability_decision, null);
  assert.equal(template.legal_context.industrial_performance.minimum_values, null);
  const html = fs.readFileSync(path.join(root, 'docs/customer-readiness/generated/werkpakket.html'), 'utf8');
  assert.ok(html.includes('industrial-model-assessment-template.json" download'));
  assert.ok(html.includes('geen algemene vrijstelling van een batterijpaspoort'));
});
