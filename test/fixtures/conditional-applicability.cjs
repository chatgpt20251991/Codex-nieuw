const { fields, isConditional, requirementFor } = require('@eubp/rules');
const { reviewedApplicabilityContext } = require('../../apps/api/dist/modules/batteries/applicability-review');

// Deliberate decisions for synthetic regression products only. This helper is
// never imported by application code and never assesses a real battery model.
function syntheticConditionalDecisions(category, applicableFieldIds = []) {
  const applicable = new Set(applicableFieldIds);
  return fields.filter(field => isConditional(requirementFor(field, category))).map(field => ({
    fieldId: field.id, applicable: applicable.has(field.id),
    reason: `Synthetic regression product: field ${field.id} (${requirementFor(field, category)}) is deliberately ${applicable.has(field.id) ? 'applicable and populated' : 'not applicable'} for this fixture.`,
  }));
}

function syntheticReviewedApplicabilityContext(category, applicableFieldIds = []) {
  return reviewedApplicabilityContext(category, {}, syntheticConditionalDecisions(category, applicableFieldIds), 'synthetic-regression-reviewer');
}
module.exports = { syntheticConditionalDecisions, syntheticReviewedApplicabilityContext };
