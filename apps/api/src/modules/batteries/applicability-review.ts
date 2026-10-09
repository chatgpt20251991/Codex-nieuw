import { createHash } from 'node:crypto';
import { fields, isConditional, requirementFor } from '@eubp/rules';
import type { BatteryCategory, ValidationIssue } from '@eubp/rules';
import { z } from 'zod';

export const ConditionalDecisionSchema = z.object({
  fieldId: z.number().int().min(1).max(71),
  applicable: z.boolean(),
  reason: z.string().trim().min(10).max(1000),
}).strict();
export const ApplicabilityReviewSchema = z.object({
  decisions: z.array(ConditionalDecisionSchema).max(71),
}).strict();
export type ConditionalDecision = z.infer<typeof ConditionalDecisionSchema>;

export function conditionalFields(category: BatteryCategory) {
  return fields.filter(field => isConditional(requirementFor(field, category)))
    .map(field => ({ fieldId: field.id, name: field.name, requirement: requirementFor(field, category) }));
}

function profileFingerprint(category: BatteryCategory) {
  return createHash('sha256').update(JSON.stringify(conditionalFields(category)
    .map(field => [field.fieldId, field.requirement]))).digest('hex');
}

// Missing decisions are deliberately unknown. A legacy required-ID list alone
// cannot prove that someone reviewed each conditional requirement.
export function assessConditionalReview(category: BatteryCategory, applicability: unknown) {
  const context = applicability && typeof applicability === 'object' && !Array.isArray(applicability)
    ? applicability as Record<string, any> : {};
  const expected = conditionalFields(category);
  const ids = new Set(expected.map(field => field.fieldId));
  const decisions = new Map<number, ConditionalDecision>();
  const issues: ValidationIssue[] = [];
  const issue = (message: string, fieldId?: number) => issues.push({
    rule: 'BP-APPLICABILITY-REVIEW', severity: 'blocker', ...(fieldId === undefined ? {} : { fieldId }), message,
  });
  if (!Array.isArray(context.conditionalDecisions)) issue('Conditional applicability has not been reviewed.');
  else for (const entry of context.conditionalDecisions) {
    const parsed = ConditionalDecisionSchema.safeParse(entry);
    if (!parsed.success) { issue('Every conditional decision requires a field, an explicit boolean and a reason of 10–1000 characters.'); continue; }
    const decision = parsed.data;
    if (!ids.has(decision.fieldId)) { issue('The review contains a field that is not conditional for this battery category.', decision.fieldId); continue; }
    if (decisions.has(decision.fieldId)) { issue('A conditional field may only be reviewed once.', decision.fieldId); continue; }
    decisions.set(decision.fieldId, decision);
  }
  const unresolvedFieldIds = expected.filter(field => !decisions.has(field.fieldId)).map(field => field.fieldId);
  for (const fieldId of unresolvedFieldIds) issue('Decide whether this conditional field is applicable and record the reason.', fieldId);
  const requiredIds = [...decisions.values()].filter(decision => decision.applicable).map(decision => decision.fieldId).sort((a,b) => a-b);
  const storedIds = context.conditionalRequiredFieldIds;
  if (!Array.isArray(storedIds) || storedIds.some((id: unknown) => !Number.isInteger(id))
    || new Set(storedIds).size !== storedIds.length
    || JSON.stringify([...storedIds].sort((a,b) => a-b)) !== JSON.stringify(requiredIds)) {
    issue('The required conditional fields do not match the reviewed decisions.');
  }
  const review = context.conditionalReview;
  if (!review || review.schemaVersion !== 1 || review.category !== category
    || review.profileFingerprint !== profileFingerprint(category)
    || typeof review.reviewedBySubject !== 'string' || !review.reviewedBySubject.trim()
    || typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt))) {
    issue('An authenticated review of the current category and conditional field profile is required.');
  }
  return { complete: issues.length === 0, fields: expected.map(field => ({ ...field,
    ...(decisions.has(field.fieldId) ? { decision: decisions.get(field.fieldId) } : {}) })), unresolvedFieldIds, issues };
}

export function reviewedApplicabilityContext(category: BatteryCategory, applicability: unknown,
  decisions: ConditionalDecision[], actorSubject: string, reviewedAt = new Date().toISOString()) {
  const previous = applicability && typeof applicability === 'object' && !Array.isArray(applicability)
    ? applicability as Record<string, any> : {};
  return { ...previous, conditionalDecisions: decisions,
    conditionalRequiredFieldIds: decisions.filter(decision => decision.applicable).map(decision => decision.fieldId).sort((a,b) => a-b),
    conditionalReview: { schemaVersion: 1, category, profileFingerprint: profileFingerprint(category), reviewedAt, reviewedBySubject: actorSubject } };
}
