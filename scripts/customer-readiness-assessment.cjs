'use strict';

// Offline collection aid only. This does not change the platform rule engine,
// verify uploaded bytes, validate passport values or certify a battery model.
const PROFILE = 'eubp.customer-assessment.2026-10-09';
const PASSPORT_DEADLINE = '2027-02-18';
const CATEGORIES = new Set(['EV', 'LMT', 'INDUSTRIAL', 'INDUSTRIAL_GT_2KWH', 'OTHER']);
const METRICS = ['rated_capacity', 'power', 'internal_resistance', 'round_trip_efficiency', 'cycle_lifetime', 'calendar_lifetime'];

function createIndustrialAssessment(scope = {}) {
  return {
    schema: 'eubp.industrial-model-assessment.v1',
    profile: PROFILE,
    internal_only: true,
    status: 'draft',
    model_scope: {
      model_id: null,
      model_name: null,
      category: null,
      rechargeable: null,
      rated_energy_kwh: null,
      exclusively_external_storage: null,
      storage_principle: null,
      finished_battery: null,
      bms: { manufacturer: null, model: null, firmware: null, shared_with_other_modules: null, dependencies: null },
      variants: [],
      intended_application: null,
      market_placement_date: null,
      ...scope,
    },
    legal_context: {
      passport: { legal_basis: 'Regulation (EU) 2023/1542 Article 77', deadline: PASSPORT_DEADLINE, applicability_decision: null },
      industrial_performance: {
        legal_basis: 'Regulation (EU) 2023/1542 Article 10',
        current_documentation_review: { legal_basis: 'Article 10(1)', status: 'requires_case_review', evidence_refs: [] },
        draft_reference: 'Ares(2026)9188325',
        draft_status: 'proposal_not_active_law',
        minimum_values: null,
        adoption_date: null,
        entry_into_force_date: null,
        minimum_requirement_application_date: null,
        application_date_rule: 'Later of 18 August 2027 or 18 months after entry into force of the final delegated act; not the passport deadline',
      },
    },
    measurements: METRICS.map(quantity => ({
      quantity, value: null, unit: null, uncertainty: null,
      measured_at: null, model_variant: null,
      test_conditions: {
        temperature_c: null, current_a: null, voltage_v: null, c_rate: null,
        state_of_charge_percent: null, depth_of_discharge_percent: null,
        reference_cycle_definition: null, test_method: null, norm_edition: null,
        description: null,
      },
      evidence_refs: [], reviewer: null, reviewed_at: null,
      status: 'not_reviewed', validated: false,
    })),
    evidence: [],
    evidence_record_template: {
      evidence_id: null, model_id: null, model_variant: null,
      document_name: null, document_revision: null, document_date: null,
      laboratory_or_supplier: null, norm_edition: null, page_or_section: null,
      content_sha256: null, byte_integrity_status: 'not_verified',
      reviewer: null, reviewed_at: null, review_status: 'not_reviewed',
    },
    review: {
      applicability_decision: null, reason: null, reviewer: null,
      reviewed_at: null, evidence_refs: [],
      open_questions: [], review_status: 'requires_case_review',
    },
    product_performance_conformity: 'not_assessed',
    registry: { submission_available: false, uploadable: false, status: 'not_submitted', external_registration_id: null },
  };
}

function knownBoolean(value) { return typeof value === 'boolean'; }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value.slice(0, 10);
}

function evaluateIndustrialAssessment(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Assessment must be an object');
  const scope = record.model_scope || {};
  const energyKnown = typeof scope.rated_energy_kwh === 'number' && Number.isFinite(scope.rated_energy_kwh) && scope.rated_energy_kwh > 0;
  const categoryKnown = CATEGORIES.has(scope.category);
  const industrial = ['INDUSTRIAL', 'INDUSTRIAL_GT_2KWH'].includes(scope.category);
  const unknown = [];
  if (!categoryKnown) unknown.push('category');
  if (!energyKnown) unknown.push('rated_energy_kwh');
  if (!knownBoolean(scope.rechargeable)) unknown.push('rechargeable');
  if (!knownBoolean(scope.exclusively_external_storage)) unknown.push('exclusively_external_storage');
  if (!knownBoolean(scope.finished_battery)) unknown.push('finished_battery');
  if (!nonempty(scope.intended_application)) unknown.push('intended_application');

  // Scope indicators are deliberately not a legal applicability decision.
  // An external-storage exception under Article 10 never propagates to Article 77.
  let article10Indicator = 'unresolved';
  let documentationIndicator = 'unresolved';
  if (categoryKnown && !industrial) documentationIndicator = 'separate_category_review_needed';
  else if (industrial && energyKnown && scope.rated_energy_kwh <= 2) documentationIndicator = 'industrial_energy_threshold_not_exceeded';
  else if (industrial && scope.rechargeable === false) documentationIndicator = 'not_rechargeable_industrial';
  else if (industrial && energyKnown && scope.rated_energy_kwh > 2 && scope.rechargeable === true) documentationIndicator = 'industrial_performance_documentation_candidate';
  if (categoryKnown && !industrial) article10Indicator = 'not_industrial_category';
  else if (industrial && energyKnown && scope.rated_energy_kwh <= 2) article10Indicator = 'at_or_below_2_kwh';
  else if (industrial && scope.rechargeable === false) article10Indicator = 'not_rechargeable';
  else if (industrial && energyKnown && scope.rated_energy_kwh > 2 && scope.rechargeable === true) {
    if (scope.exclusively_external_storage === true) article10Indicator = 'external_storage_exception_candidate';
    if (scope.exclusively_external_storage === false) article10Indicator = 'minimum_performance_scope_candidate';
  }
  let passportIndicator = 'unresolved';
  if (scope.category === 'EV' || scope.category === 'LMT' || (industrial && energyKnown && scope.rated_energy_kwh > 2)) passportIndicator = 'passport_scope_candidate';
  else if (industrial && energyKnown && scope.rated_energy_kwh <= 2) passportIndicator = 'industrial_energy_threshold_not_exceeded';
  else if (scope.category === 'OTHER') passportIndicator = 'category_review_needed';

  const review = record.review || {};
  const reviewGaps = [];
  if (!nonempty(scope.model_id)) reviewGaps.push('model_id');
  if (!['in_scope', 'out_of_scope'].includes(review.applicability_decision)) reviewGaps.push('applicability_decision');
  if (!nonempty(review.reason)) reviewGaps.push('reason');
  if (!nonempty(review.reviewer)) reviewGaps.push('reviewer');
  if (!isoDate(review.reviewed_at)) reviewGaps.push('reviewed_at');
  if (!Array.isArray(review.evidence_refs) || review.evidence_refs.length === 0) reviewGaps.push('evidence_refs');
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  for (const id of Array.isArray(review.evidence_refs) ? review.evidence_refs : []) {
    const found = evidence.filter(e => e && e.evidence_id === id);
    if (!nonempty(id) || found.length !== 1) { reviewGaps.push(`evidence:${String(id)}:missing_or_duplicate`); continue; }
    const e = found[0];
    if (e.model_id !== scope.model_id || !nonempty(e.model_id)) reviewGaps.push(`evidence:${id}:model_mismatch`);
    if (!/^[a-f0-9]{64}$/.test(e.content_sha256 || '')) reviewGaps.push(`evidence:${id}:hash_missing`);
    if (!nonempty(e.reviewer) || !isoDate(e.reviewed_at) || e.review_status !== 'reviewed') reviewGaps.push(`evidence:${id}:review_missing`);
    if (e.byte_integrity_status !== 'verified') reviewGaps.push(`evidence:${id}:byte_integrity_unverified`);
  }
  // Metadata supplied to an offline document is not a trusted validation event.
  // Even complete metadata must be checked against actual evidence and an audit trail.
  return {
    internal_only: true,
    article10_scope_indicator: article10Indicator,
    article10_documentation_scope_indicator: documentationIndicator,
    passport_scope_indicator: passportIndicator,
    passport_deadline: PASSPORT_DEADLINE,
    unknown_scope_inputs: unknown,
    review_metadata_gaps: reviewGaps,
    review_status: unknown.length || reviewGaps.length ? 'requires_case_review' : 'review_metadata_complete_requires_verification',
    applicability_decision: null,
    suggested_reviewer_decision: ['in_scope', 'out_of_scope'].includes(review.applicability_decision) ? review.applicability_decision : null,
    product_performance_conformity: 'not_assessed',
    validated: false,
    minimum_values_applied: false,
    registry_registered: false,
  };
}

module.exports = { PROFILE, PASSPORT_DEADLINE, createIndustrialAssessment, evaluateIndustrialAssessment };
