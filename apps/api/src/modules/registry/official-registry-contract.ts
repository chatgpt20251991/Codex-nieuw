import { z } from 'zod';
import { hashJson } from '../../common/crypto/canonical';
import { DRAFT_STATUS, validRegistryUpi } from './registry-contract';

// Pure preparation only. Source: Commission OpenAPI 3.1.0 / specification 1.0.0,
// published 2026-10-30; provenance and remaining acceptance are in docs/31.
export const OFFICIAL_REGISTRY_CONTRACT = 'ec.registry.openapi.2026-10-30.v1.0.0';
export const OFFICIAL_REGISTRY_MAX_REQUEST_BYTES = 10_000_000;
const observationOperation = 'GET /api/v1/dpp/product-groups';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(128).refine(value => value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value));
// Local transport policy: bounded visible ASCII for manually supplied headers.
const headerValue = z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/);
const timestamp = z.iso.datetime({ offset: true });
const category = z.enum(['EV', 'LMT', 'INDUSTRIAL_GT_2KWH']);
const mappingSchema = z.array(z.object({ category, productSubGroup: identifier }).strict()).min(1).max(3);
const catalogueSchema = z.array(z.object({ code: identifier, label: z.string().min(1).max(512),
  productSubGroups: z.array(z.object({ code: identifier, label: z.string().min(1).max(512) }).strict()).max(32),
}).strict()).min(1).max(32);
const recordSchema = z.object({ batteryItemId: z.string().uuid(), passportVersionId: z.string().uuid(),
  upi: z.string().max(2000).refine(validRegistryUpi),
  productIdentifier: z.string().min(1).max(4096), schemaStatus: z.literal(DRAFT_STATUS), category,
  schemaVersion: z.string().min(1).max(512).refine(value => Boolean(value.trim())),
  ruleSetVersion: z.string().min(1).max(512).refine(value => Boolean(value.trim())),
  passportSha256: digest,
}).strict();
const inputSchema = z.object({
  records: z.array(recordSchema).min(1).max(100),
  catalogueObservation: z.object({
    kind: z.enum(['synthetic_fixture', 'recorded_reference_data']),
    environment: z.enum(['synthetic', 'acceptance', 'production']),
    operation: z.literal(observationOperation), observedAt: timestamp,
    productGroups: catalogueSchema,
  }).strict(),
  categoryMapping: mappingSchema,
  review: z.object({ status: z.literal('reviewed_for_offline_preparation'),
    reference: z.string().min(1).max(256).refine(value => Boolean(value.trim())), reviewedAt: timestamp,
    canonicalCatalogueSha256: digest, canonicalMappingSha256: digest,
  }).strict(),
  idempotencyKey: headerValue, correlationId: headerValue.optional(),
  previousPreparation: z.object({ contractVersion: z.literal(OFFICIAL_REGISTRY_CONTRACT),
    idempotencyKey: headerValue, requestSha256: digest, preparationSha256: digest,
  }).strict().optional(),
}).strict();

export class OfficialRegistryPreparationError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'OfficialRegistryPreparationError'; }
}
function demand(condition: unknown, code: string): asserts condition {
  if (!condition) throw new OfficialRegistryPreparationError(code);
}
function unique(values: readonly string[]) { return new Set(values).size === values.length; }

export interface OfficialBatterySubmissionItem {
  uniqueProductIdentifier: string;
  granularity: 'item';
  modelIdentifier?: string;
  batchIdentifier?: string;
}
export interface OfficialBatterySubmissionRequest {
  productGroup: 'BATTERIES';
  productSubGroup: string;
  submissionItems: readonly Readonly<OfficialBatterySubmissionItem>[];
}

/** Convert one already-prevalidated, same-classification internal draft batch.
 * This function cannot authenticate the supplied observation or inspect stored
 * publications. Review metadata and hashes bind the supplied data, not its truth.
 * No default catalogue codes, credentials, clock, HTTP, database or file access.
 */
export function prepareOfficialRegistryRequest(input: unknown) {
  // Cheap cardinality checks precede schema traversal/canonical hashing.
  const raw = input as any;
  demand(Array.isArray(raw?.records) && raw.records.length >= 1 && raw.records.length <= 100,
    'OFFICIAL_REQUEST_ITEM_LIMIT');
  demand(Array.isArray(raw?.catalogueObservation?.productGroups) && raw.catalogueObservation.productGroups.length <= 32 &&
    raw.catalogueObservation.productGroups.every((group: any) => Array.isArray(group?.productSubGroups) && group.productSubGroups.length <= 32),
  'OFFICIAL_CATALOGUE_LIMIT');
  const parsed = inputSchema.safeParse(input);
  demand(parsed.success, 'INVALID_OFFICIAL_PREPARATION_INPUT');
  const { records, catalogueObservation: observation, categoryMapping, review } = parsed.data;
  demand((observation.kind === 'synthetic_fixture') === (observation.environment === 'synthetic'),
    'CATALOGUE_OBSERVATION_ENVIRONMENT_MISMATCH');
  demand(Date.parse(review.reviewedAt) >= Date.parse(observation.observedAt), 'CATALOGUE_REVIEW_PRECEDES_OBSERVATION');
  demand(hashJson(observation.productGroups) === review.canonicalCatalogueSha256 &&
    hashJson(categoryMapping) === review.canonicalMappingSha256, 'CATALOGUE_REVIEW_HASH_MISMATCH');
  demand(unique(observation.productGroups.map(group => group.code)) &&
    observation.productGroups.every(group => unique(group.productSubGroups.map(subgroup => subgroup.code))),
  'AMBIGUOUS_CATALOGUE_CODES');
  demand(unique(categoryMapping.map(mapping => mapping.category)), 'AMBIGUOUS_CATEGORY_MAPPING');
  const batteryGroup = observation.productGroups.find(group => group.code === 'BATTERIES');
  demand(batteryGroup, 'BATTERY_CLASSIFICATION_NOT_OBSERVED');
  demand(categoryMapping.every(mapping => batteryGroup.productSubGroups.some(subgroup => subgroup.code === mapping.productSubGroup)),
    'MAPPED_SUBGROUP_NOT_OBSERVED');
  demand(unique(records.map(record => record.upi)) && unique(records.map(record => record.batteryItemId)) &&
    unique(records.map(record => record.passportVersionId)), 'DUPLICATE_OFFICIAL_REQUEST_ITEM');
  const first = records[0];
  demand(records.every(record => record.category === first.category && record.schemaVersion === first.schemaVersion &&
    record.ruleSetVersion === first.ruleSetVersion), 'MIXED_INTERNAL_DRAFT_BATCH');
  const mapping = categoryMapping.find(candidate => candidate.category === first.category);
  demand(mapping, 'CATEGORY_MAPPING_REQUIRED');
  const body: Readonly<OfficialBatterySubmissionRequest> = Object.freeze({ productGroup: 'BATTERIES',
    productSubGroup: mapping.productSubGroup,
    // Serial/productIdentifier is not a model identifier or batch identifier.
    // The internal record has neither optional field: do not manufacture them.
    submissionItems: Object.freeze(records.map(record => Object.freeze({ uniqueProductIdentifier: record.upi,
      granularity: 'item' as const }))),
  });
  demand(Buffer.byteLength(JSON.stringify(body), 'utf8') <= OFFICIAL_REGISTRY_MAX_REQUEST_BYTES,
    'OFFICIAL_REQUEST_BYTE_LIMIT');
  const requestSha256 = hashJson(body);
  const sourceBindings = Object.freeze(records.map(record => Object.freeze({ batteryItemId: record.batteryItemId,
    passportVersionId: record.passportVersionId, passportSha256: record.passportSha256,
    uniqueProductIdentifier: record.upi })));
  // A new publication can keep the same UPI and HTTP body. A retry must still
  // bind the exact source publication and environment, not reuse an old task
  // merely because the registration metadata happened to stay unchanged.
  const preparationSha256 = hashJson({ contractVersion: OFFICIAL_REGISTRY_CONTRACT,
    environment: observation.environment, requestBody: body, sourceBindings });
  const previous = parsed.data.previousPreparation;
  if (previous) {
    const unchanged = previous.requestSha256 === requestSha256 && previous.preparationSha256 === preparationSha256;
    demand(previous.idempotencyKey !== parsed.data.idempotencyKey || unchanged,
      'IDEMPOTENCY_KEY_REUSED_FOR_CHANGED_REQUEST');
    demand(!unchanged || previous.idempotencyKey === parsed.data.idempotencyKey,
      'RETRY_IDEMPOTENCY_KEY_CHANGED');
  }
  return Object.freeze({ kind: 'offline_official_registry_request_preparation' as const,
    contractVersion: OFFICIAL_REGISTRY_CONTRACT, preparationOnly: true as const,
    liveActivationApproved: false as const, liveSubmissionAttempted: false as const,
    sourcePublicationValidationRechecked: false as const, catalogueAuthenticityVerified: false as const,
    catalogueObservation: Object.freeze({ kind: observation.kind, environment: observation.environment,
      operation: observation.operation, observedAt: observation.observedAt,
      canonicalCatalogueSha256: review.canonicalCatalogueSha256, canonicalMappingSha256: review.canonicalMappingSha256,
      reviewReference: review.reference, reviewedAt: review.reviewedAt }),
    request: Object.freeze({ method: 'POST' as const, path: '/api/v1/dpp/submission' as const,
      headers: Object.freeze({ 'Content-Type': 'application/json', 'Idempotency-Key': parsed.data.idempotencyKey,
        ...(parsed.data.correlationId ? { 'X-Correlation-Id': parsed.data.correlationId } : {}) }), body }),
    requestSha256, preparationSha256, sourceBindings,
  });
}

const acknowledgementSchema = z.object({ taskId: z.string().min(1).max(512),
  submittedAt: timestamp, taskType: z.literal('DPP_REGISTRATION'),
  correlationId: z.string().max(128).nullable(),
});

/** Inspect only the published AcceptedAsyncOperation fields. This is not a
 * task-result classifier: task COMPLETED, success messages, URIs or counters
 * must never be interpreted as positive per-item evidence by this helper.
 */
export function inspectOfficialRegistryAcknowledgement(httpStatus: unknown, body: unknown, expectedCorrelationId?: string) {
  const safety = { preparationOnly: true as const, liveActivationApproved: false as const,
    liveSubmissionAttempted: false as const, responseAuthenticityVerified: false as const };
  if (httpStatus !== 202) return Object.freeze({ ...safety, classification: 'not_an_accepted_submission' as const });
  const parsed = acknowledgementSchema.safeParse(body);
  if (!parsed.success) return Object.freeze({ ...safety, classification: 'invalid_acknowledgement' as const });
  if (expectedCorrelationId !== undefined && (!headerValue.safeParse(expectedCorrelationId).success ||
      parsed.data.correlationId !== expectedCorrelationId)) {
    return Object.freeze({ ...safety, classification: 'correlation_mismatch' as const });
  }
  return Object.freeze({ ...safety, classification: 'accepted_for_processing_only' as const,
    taskId: parsed.data.taskId, taskType: parsed.data.taskType,
    submittedAt: parsed.data.submittedAt, correlationId: parsed.data.correlationId });
}
