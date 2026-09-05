const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { serializeRegistryDraft, buildRegistryDraft, ExportRequest, validRegistryUpi } =
  require('../../apps/api/dist/modules/registry/registry-contract.js');
const { DisabledRegistryAdapter } = require('../../apps/api/dist/modules/registry/registry.adapter.js');
const { RegistryController } = require('../../apps/api/dist/modules/registry/registry.controller.js');
const { HealthController } = require('../../apps/api/dist/modules/health/health.controller.js');
const fixture = name => readFileSync(resolve(__dirname, '../fixtures/registry', name), 'utf8').replace(/\r\n/g, '\n');
const golden = JSON.parse(fixture('internal-draft.json'));
const record = golden.records[0];
const records = count => Array.from({ length: count }, (_, index) => ({ ...record,
  batteryItemId: randomUUID(), passportVersionId: randomUUID(), upi: `https://id.example.invalid/b/${index}` }));

test('Gate 6: JSON and XML match explicit internal fixtures including Unicode, markup and line endings', () => {
  for (const format of ['json', 'xml']) {
    assert.equal(serializeRegistryDraft([record], format, golden.correlationId), fixture(`internal-draft.${format}`));
    const reordered = Object.fromEntries(Object.entries(record).reverse());
    assert.equal(serializeRegistryDraft([reordered], format, golden.correlationId), fixture(`internal-draft.${format}`));
  }
});

test('Gate 6: file splitting obeys 1/100/101/1000 boundaries and hashes exact UTF-8 file bytes', () => {
  for (const format of ['json', 'xml']) for (const count of [1, 100, 101, 1000]) {
    const input = records(count), draft = buildRegistryDraft(input, format);
    assert.equal(draft.files.length, Math.ceil(count / 100));
    assert.deepEqual(draft.batches.flat(), input);
    assert.equal(new Set(draft.files.map(file => file.correlationId)).size, draft.files.length);
    for (const file of draft.files) {
      assert.ok(file.recordCount > 0 && file.recordCount <= 100);
      assert.equal(file.sha256, createHash('sha256').update(file.content, 'utf8').digest('hex'));
      assert.match(file.filename, /^[A-Za-z0-9_.-]+$/);
    }
    assert.equal(draft.uploadable, false); assert.equal(draft.officialSchema, null);
    assert.equal(draft.result.externalCorrelationId, null); assert.equal(draft.result.liveSubmissionAttempted, false);
  }
});

test('Gate 6: grouping separates category, schema and rule version before splitting in stable order', () => {
  const input = records(5);
  input[1].category = 'LMT'; input[2].schemaVersion = 'internal-next-schema'; input[3].ruleSetVersion = 'internal-next-rule';
  const draft = buildRegistryDraft(input, 'json');
  assert.deepEqual(draft.batches, [[input[0], input[4]], [input[1]], [input[2]], [input[3]]]);
});

test('Gate 6: duplicate identifiers are rejected across file boundaries without partial output', () => {
  const input = records(101); input[100].upi = input[0].upi;
  assert.throws(() => buildRegistryDraft(input, 'json'), /Duplicate/);
  input[100].upi = 'https://id.example.invalid/unique'; input[100].batteryItemId = input[0].batteryItemId;
  assert.throws(() => buildRegistryDraft(input, 'xml'), /Duplicate/);
});

test('Gate 6: empty/oversized contracts, unknown fields, arbitrary XML tags and false readiness fail closed', () => {
  assert.throws(() => buildRegistryDraft([], 'json'));
  assert.throws(() => buildRegistryDraft(records(1001), 'xml'));
  assert.throws(() => serializeRegistryDraft(records(101), 'json', golden.correlationId));
  for (const changed of [{ ...record, schemaStatus: 'ready' }, { ...record, '</record><attack>': 'injection' },
    { ...record, productIdentifier: 'bad\u0000text' }, { ...record, productIdentifier: 'bad\ud800text' },
    { ...record, schemaVersion: '' }, { ...record, ruleSetVersion: '   ' }]) {
    assert.throws(() => serializeRegistryDraft([changed], 'xml', golden.correlationId));
  }
  for (const body of [{}, { itemIds: [] }, { itemIds: [record.batteryItemId, record.batteryItemId] },
    { itemIds: [record.batteryItemId], organisationId: randomUUID() }, { itemIds: ['invalid'] }]) {
    assert.throws(() => ExportRequest.parse(body));
  }
});

test('Gate 6: documented HTTPS/2000 limit and internal credentials/fragment restrictions are enforced', () => {
  const prefix = 'https://id.example.invalid/';
  assert.equal(validRegistryUpi(prefix + 'x'.repeat(2000 - prefix.length)), true);
  assert.equal(validRegistryUpi(prefix + 'x'.repeat(2001 - prefix.length)), false);
  for (const value of [null, '', 'http://example.invalid', 'https://', 'https://user:pass@example.invalid',
    'https://example.invalid/#fragment', 'https://example.invalid/#', ' https://example.invalid', 'https://example.invalid/white space']) {
    assert.equal(validRegistryUpi(value), false, String(value));
  }
});

test('Gate 6: enabled flags and successful prerequisite checks still cannot enable a missing adapter', async () => {
  const names = ['BATTERY_SEMANTIC_CATALOGUE_AVAILABLE', 'REGISTRY_BATTERY_SUBMISSION_AVAILABLE'];
  const original = names.map(name => process.env[name]);
  try {
    for (const name of names) process.env[name] = 'true';
    const controller = new RegistryController({ validate: async () => ({ publicationBlockers: [] }) },
      { gate: async () => ({ allowed: true }) }, {});
    const gate = await controller.gate(randomUUID(), {}, record.batteryItemId);
    assert.equal(gate.complianceGate.allowed, true); assert.equal(gate.actorGate.allowed, true);
    assert.equal(gate.allowed, false); assert.equal(gate.code, 'LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED');
    assert.equal(new HealthController().get().registryBatterySubmissionAvailable, false);
    const draft = buildRegistryDraft([record], 'json');
    assert.equal(draft.batches[0][0].schemaStatus, 'draft-pending-battery-semantic-catalogue');
    assert.equal(draft.result.outcome, 'blocked'); assert.equal(draft.result.registryUri, null);
    await assert.rejects(new DisabledRegistryAdapter().submit([record]), /disabled/);
  } finally {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
  }
});
