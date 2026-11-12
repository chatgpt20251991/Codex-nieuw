'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hashJson } = require('../../apps/api/dist/common/crypto/canonical');
const { DRAFT_STATUS } = require('../../apps/api/dist/modules/registry/registry-contract');
const { prepareOfficialRegistryRequest, inspectOfficialRegistryAcknowledgement,
  OFFICIAL_REGISTRY_CONTRACT, OFFICIAL_REGISTRY_MAX_REQUEST_BYTES,
} = require('../../apps/api/dist/modules/registry/official-registry-contract');

// Wholly synthetic reference data and immutable-publication identifiers. These
// are not an observed live catalogue, Registry response or registration proof.
function fixture(count = 1) {
  const records = Array.from({ length: count }, (_, index) => ({ batteryItemId: randomUUID(), passportVersionId: randomUUID(),
    upi: `https://operator.example.invalid/b/${index}?view=json`, productIdentifier: `synthetic-private-serial-${index}`,
    schemaStatus: DRAFT_STATUS, category: 'EV', schemaVersion: 'eubp.passport.v2.1',
    ruleSetVersion: 'EU-BR-2026.08', passportSha256: 'a'.repeat(64) }));
  const input = { records, catalogueObservation: { kind: 'synthetic_fixture', environment: 'synthetic',
    operation: 'GET /api/v1/dpp/product-groups', observedAt: '2026-11-12T08:00:00Z',
    productGroups: [{ code: 'BATTERIES', label: 'Synthetic batteries', productSubGroups: [
      { code: 'EV', label: 'Synthetic EV' }, { code: 'LMT', label: 'Synthetic LMT' },
      { code: 'SYNTHETIC_INDUSTRIAL_CODE', label: 'Synthetic industrial catalogue value' },
    ] }] }, categoryMapping: [{ category: 'EV', productSubGroup: 'EV' }],
  review: { status: 'reviewed_for_offline_preparation', reference: 'synthetic-review-only',
    reviewedAt: '2026-11-12T08:01:00Z', canonicalCatalogueSha256: '', canonicalMappingSha256: '' },
  idempotencyKey: 'synthetic-request-1', correlationId: 'synthetic-correlation-1' };
  return rebindReview(input);
}
function rebindReview(input) {
  input.review.canonicalCatalogueSha256 = hashJson(input.catalogueObservation.productGroups);
  input.review.canonicalMappingSha256 = hashJson(input.categoryMapping);
  return input;
}
const fails = (input, code) => assert.throws(() => prepareOfficialRegistryRequest(input), error => error.code === code);
const acknowledgement = () => ({ taskId: 'synthetic_task_001', taskType: 'DPP_REGISTRATION',
  submittedAt: '2026-11-12T08:02:00Z', correlationId: 'synthetic-correlation-1' });

test('official request preparation projects only published-contract fields and preserves exact source identities without mutation', () => {
  const input = fixture(2), before = structuredClone(input);
  input.records[1].upi = 'https://operator.example.invalid/b/exact%2Fencoded?next=%2funchanged';
  before.records[1].upi = input.records[1].upi;
  const result = prepareOfficialRegistryRequest(input);
  assert.deepEqual(input, before);
  assert.equal(result.contractVersion, OFFICIAL_REGISTRY_CONTRACT);
  assert.equal(result.liveActivationApproved, false); assert.equal(result.liveSubmissionAttempted, false);
  assert.equal(result.catalogueAuthenticityVerified, false); assert.equal(result.sourcePublicationValidationRechecked, false);
  assert.deepEqual(result.request.body, { productGroup: 'BATTERIES', productSubGroup: 'EV', submissionItems: [
    { uniqueProductIdentifier: input.records[0].upi, granularity: 'item' },
    { uniqueProductIdentifier: input.records[1].upi, granularity: 'item' },
  ] });
  assert.equal(result.request.method, 'POST'); assert.equal(result.request.path, '/api/v1/dpp/submission');
  assert.deepEqual(result.request.headers, { 'Content-Type': 'application/json',
    'Idempotency-Key': input.idempotencyKey, 'X-Correlation-Id': input.correlationId });
  assert.equal(result.requestSha256, hashJson(result.request.body));
  assert.equal(result.sourceBindings[0].passportSha256, input.records[0].passportSha256);
  for (const key of ['batteryItemId', 'passportVersionId', 'passportSha256', 'productIdentifier', 'records', 'kind', 'uploadable']) {
    assert.equal(JSON.stringify(result.request.body).includes(`"${key}"`), false);
  }
  assert.equal(JSON.stringify(result).includes('synthetic-private-serial'), false);
  assert.equal(Object.hasOwn(result, 'registered'), false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.request.body) && Object.isFrozen(result.request.body.submissionItems));
  assert.throws(() => { result.request.body.submissionItems[0].granularity = 'model'; }, TypeError);
  assert.deepEqual(prepareOfficialRegistryRequest(input), result, 'Preparation does not generate time, IDs or replacement retry keys');
});

test('official batch and UPI limits reject the entire input without splitting, truncation or changing item granularity', () => {
  fails(fixture(0), 'OFFICIAL_REQUEST_ITEM_LIMIT'); fails(fixture(101), 'OFFICIAL_REQUEST_ITEM_LIMIT');
  const hundred = fixture(100), result = prepareOfficialRegistryRequest(hundred);
  assert.equal(result.request.body.submissionItems.length, 100);
  assert.ok(Buffer.byteLength(JSON.stringify(result.request.body), 'utf8') <= OFFICIAL_REGISTRY_MAX_REQUEST_BYTES);
  const boundary = fixture(); boundary.records[0].upi = 'https://operator.example.invalid/' + 'x'.repeat(2000 - 'https://operator.example.invalid/'.length);
  assert.equal(prepareOfficialRegistryRequest(boundary).request.body.submissionItems[0].uniqueProductIdentifier.length, 2000);
  boundary.records[0].upi += 'x'; fails(boundary, 'INVALID_OFFICIAL_PREPARATION_INPUT');
  for (const upi of ['http://operator.example.invalid/b/1', 'https://user:secret@operator.example.invalid/b/1',
    'https://operator.example.invalid/b/1#fragment', 'https://operator.example.invalid/b/white space', 'javascript:invalid']) {
    const input = fixture(); input.records[0].upi = upi; fails(input, 'INVALID_OFFICIAL_PREPARATION_INPUT');
  }
});

test('classification requires an explicit reviewed catalogue mapping and never guesses the industrial API code', () => {
  const industrial = fixture(); industrial.records[0].category = 'INDUSTRIAL_GT_2KWH';
  fails(industrial, 'CATEGORY_MAPPING_REQUIRED');
  industrial.categoryMapping = [{ category: 'INDUSTRIAL_GT_2KWH', productSubGroup: 'IND' }];
  fails(rebindReview(industrial), 'MAPPED_SUBGROUP_NOT_OBSERVED');
  industrial.categoryMapping[0].productSubGroup = 'SYNTHETIC_INDUSTRIAL_CODE';
  const result = prepareOfficialRegistryRequest(rebindReview(industrial));
  assert.equal(result.request.body.productSubGroup, 'SYNTHETIC_INDUSTRIAL_CODE');
  assert.equal(result.catalogueObservation.kind, 'synthetic_fixture'); assert.equal(result.liveActivationApproved, false);
  const missingGroup = fixture(); missingGroup.catalogueObservation.productGroups[0].code = 'TEXTILES';
  fails(rebindReview(missingGroup), 'BATTERY_CLASSIFICATION_NOT_OBSERVED');
});

test('altered, unreviewed, contradictory and ambiguous reference data or mappings cannot silently change classification', () => {
  const changed = fixture(); changed.categoryMapping[0].productSubGroup = 'LMT';
  fails(changed, 'CATALOGUE_REVIEW_HASH_MISMATCH');
  const changedCatalogue = fixture(); changedCatalogue.catalogueObservation.productGroups[0].productSubGroups[0].code = 'CHANGED';
  fails(changedCatalogue, 'CATALOGUE_REVIEW_HASH_MISMATCH');
  const duplicateCategory = fixture(); duplicateCategory.categoryMapping.push({ category: 'EV', productSubGroup: 'LMT' });
  fails(rebindReview(duplicateCategory), 'AMBIGUOUS_CATEGORY_MAPPING');
  const duplicateGroup = fixture(); duplicateGroup.catalogueObservation.productGroups.push(structuredClone(duplicateGroup.catalogueObservation.productGroups[0]));
  fails(rebindReview(duplicateGroup), 'AMBIGUOUS_CATALOGUE_CODES');
  const duplicateSubgroup = fixture(); duplicateSubgroup.catalogueObservation.productGroups[0].productSubGroups.push({ code: 'EV', label: 'Conflicting EV' });
  fails(rebindReview(duplicateSubgroup), 'AMBIGUOUS_CATALOGUE_CODES');
  const contradictory = fixture(); contradictory.catalogueObservation.environment = 'production';
  fails(contradictory, 'CATALOGUE_OBSERVATION_ENVIRONMENT_MISMATCH');
  const earlyReview = fixture(); earlyReview.review.reviewedAt = '2026-11-12T07:59:00Z';
  fails(earlyReview, 'CATALOGUE_REVIEW_PRECEDES_OBSERVATION');
  for (const mutation of [input => { delete input.review; }, input => { input.review.status = 'unreviewed'; },
    input => { input.catalogueObservation.operation = 'POST /unverified'; }, input => { input.catalogueObservation.productGroups[0].productSubGroups = []; }]) {
    const input = fixture(); mutation(input); assert.throws(() => prepareOfficialRegistryRequest(input));
  }
});

test('one item, publication or UPI cannot appear twice and mixed local draft classifications or versions cannot become one official batch', () => {
  for (const property of ['upi', 'batteryItemId', 'passportVersionId']) {
    const input = fixture(2); input.records[1][property] = input.records[0][property];
    fails(input, 'DUPLICATE_OFFICIAL_REQUEST_ITEM');
  }
  for (const [property, value] of [['category', 'LMT'], ['schemaVersion', 'different-schema'], ['ruleSetVersion', 'different-rules']]) {
    const input = fixture(2); input.records[1][property] = value;
    fails(input, 'MIXED_INTERNAL_DRAFT_BATCH');
  }
  const invalidHash = fixture(); invalidHash.records[0].passportSha256 = 'bad-hash';
  fails(invalidHash, 'INVALID_OFFICIAL_PREPARATION_INPUT');
  const fabricatedState = fixture(); fabricatedState.records[0].schemaStatus = 'registered';
  fails(fabricatedState, 'INVALID_OFFICIAL_PREPARATION_INPUT');
  const injectedPrivateValues = fixture(); injectedPrivateValues.records[0].canonicalJson = { private: 'must-not-be-forwarded' };
  fails(injectedPrivateValues, 'INVALID_OFFICIAL_PREPARATION_INPUT');
});

test('retry fingerprints retain caller-supplied keys and reject key changes or key reuse with changed request bodies', () => {
  const input = fixture(), prepared = prepareOfficialRegistryRequest(input);
  const previous = { contractVersion: prepared.contractVersion, idempotencyKey: input.idempotencyKey,
    requestSha256: prepared.requestSha256, preparationSha256: prepared.preparationSha256 };
  input.previousPreparation = previous;
  assert.equal(prepareOfficialRegistryRequest(input).requestSha256, prepared.requestSha256);
  input.records[0].upi += '-changed'; fails(input, 'IDEMPOTENCY_KEY_REUSED_FOR_CHANGED_REQUEST');
  input.idempotencyKey = 'new-logical-request'; assert.notEqual(prepareOfficialRegistryRequest(input).requestSha256, prepared.requestSha256);
  const same = fixture(); same.records = structuredClone(fixture().records);
  const ownFirst = prepareOfficialRegistryRequest(same);
  same.previousPreparation = { contractVersion: ownFirst.contractVersion, idempotencyKey: same.idempotencyKey,
    requestSha256: ownFirst.requestSha256, preparationSha256: ownFirst.preparationSha256 };
  same.idempotencyKey = 'changed-only-key'; fails(same, 'RETRY_IDEMPOTENCY_KEY_CHANGED');
  for (const key of ['', 'x'.repeat(129), 'header\r\ninjection', 'white space']) {
    const bad = fixture(); bad.idempotencyKey = key; fails(bad, 'INVALID_OFFICIAL_PREPARATION_INPUT');
  }
});

test('retry identity also binds the immutable publication and environment when the UPI/request body stays unchanged', () => {
  const input = fixture(), first = prepareOfficialRegistryRequest(input);
  input.previousPreparation = { contractVersion: first.contractVersion, idempotencyKey: input.idempotencyKey,
    requestSha256: first.requestSha256, preparationSha256: first.preparationSha256 };
  input.records[0].passportVersionId = randomUUID(); input.records[0].passportSha256 = 'b'.repeat(64);
  fails(input, 'IDEMPOTENCY_KEY_REUSED_FOR_CHANGED_REQUEST');
  input.idempotencyKey = 'new-publication-request';
  const next = prepareOfficialRegistryRequest(input);
  assert.equal(next.requestSha256, first.requestSha256); assert.notEqual(next.preparationSha256, first.preparationSha256);
  const environment = fixture(), before = prepareOfficialRegistryRequest(environment);
  environment.previousPreparation = { contractVersion: before.contractVersion, idempotencyKey: environment.idempotencyKey,
    requestSha256: before.requestSha256, preparationSha256: before.preparationSha256 };
  environment.catalogueObservation.kind = 'recorded_reference_data'; environment.catalogueObservation.environment = 'production';
  fails(environment, 'IDEMPOTENCY_KEY_REUSED_FOR_CHANGED_REQUEST');
});

test('catalogue review remains caller-recorded preparation even when it describes a production observation', () => {
  const input = fixture(); input.catalogueObservation.kind = 'recorded_reference_data'; input.catalogueObservation.environment = 'production';
  const prepared = prepareOfficialRegistryRequest(input);
  assert.equal(prepared.catalogueAuthenticityVerified, false); assert.equal(prepared.liveActivationApproved, false);
  const overlarge = fixture(); overlarge.catalogueObservation.productGroups = Array(33).fill(null);
  fails(overlarge, 'OFFICIAL_CATALOGUE_LIMIT');
  const tooManySubgroups = fixture(); tooManySubgroups.catalogueObservation.productGroups[0].productSubGroups = Array(33).fill(null);
  fails(tooManySubgroups, 'OFFICIAL_CATALOGUE_LIMIT');
});

test('202 acknowledgements identify processing only; malformed, foreign-type and mismatched-correlation replies fail closed', () => {
  const result = inspectOfficialRegistryAcknowledgement(202, acknowledgement(), 'synthetic-correlation-1');
  assert.equal(result.classification, 'accepted_for_processing_only'); assert.equal(result.taskId, 'synthetic_task_001');
  assert.equal(result.liveActivationApproved, false); assert.equal(result.responseAuthenticityVerified, false);
  assert.equal(Object.hasOwn(result, 'registered'), false);
  const nullable = acknowledgement(); nullable.correlationId = null;
  assert.equal(inspectOfficialRegistryAcknowledgement(202, nullable).classification, 'accepted_for_processing_only');
  assert.equal(inspectOfficialRegistryAcknowledgement(202, nullable, 'expected').classification, 'correlation_mismatch');
  for (const mutation of [body => { delete body.taskId; }, body => { body.taskType = 'ORGANISATION_VERIFICATION_SUBMISSION'; },
    body => { body.submittedAt = 'not-a-time'; }, body => { delete body.correlationId; }, body => { body.taskId = 'x'.repeat(513); }]) {
    const body = acknowledgement(); mutation(body);
    assert.equal(inspectOfficialRegistryAcknowledgement(202, body).classification, 'invalid_acknowledgement');
  }
});

test('completed, failed, denied, mixed-item and success-looking messages never become positive final outcomes through the ACK inspector', () => {
  for (const status of [200, 201, 400, 403, 409, 422, 429, 500, '202']) {
    assert.equal(inspectOfficialRegistryAcknowledgement(status, { ...acknowledgement(), status: 'COMPLETED',
      outcome: { outcomeResult: 'SUCCEEDED' }, uniqueRegistryIdentifier: 'synthetic-uri' }).classification, 'not_an_accepted_submission');
  }
  for (const outcomeResult of ['SUCCEEDED', 'FAILED', 'DENIED']) {
    const result = inspectOfficialRegistryAcknowledgement(202, { ...acknowledgement(), status: 'COMPLETED', outcome: { outcomeResult },
      specificTaskData: { processingInfo: { submittedItems: 2, compliantItems: 1, nonCompliantItems: 1 } }, registered: true });
    assert.equal(result.classification, 'accepted_for_processing_only');
    for (const property of ['registered', 'uniqueRegistryIdentifier', 'outcome', 'status', 'specificTaskData']) assert.equal(Object.hasOwn(result, property), false);
    assert.equal(result.liveActivationApproved, false);
  }
});
