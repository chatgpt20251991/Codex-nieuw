'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { hashJson } = require('../../scripts/passport-export.cjs');
module.exports = function syntheticExport() {
  const now = new Date().toISOString(), itemId = randomUUID(), modelId = randomUUID(), publicId = randomUUID(), evidenceId = randomUUID();
  const bytes = Buffer.from('Synthetic successor-provider source report. No customer data.\n');
  const canonical = { schema: 'eubatterypassport.v2', ruleSetVersion: 'SYNTHETIC-TEST', generatedAt: now,
    battery: { id: itemId, modelId, publicId, category: 'EV' },
    values: [{ fieldId: 11, value: 0, evidenceIds: [evidenceId] },
      { fieldId: 50, value: 'Synthetic authority-only confidential value', evidenceIds: [evidenceId] }] };
  const first = { id: randomUUID(), versionNo: 1, schemaVersion: canonical.schema, ruleSetVersion: canonical.ruleSetVersion,
    canonicalJson: canonical, sha256: hashJson(canonical), previousVersionHash: null,
    publicationState: 'published', publishedAt: now, createdAt: now };
  const next = structuredClone(canonical); next.values[0].value = 1;
  const second = { ...first, id: randomUUID(), versionNo: 2, canonicalJson: next,
    sha256: hashJson(next), previousVersionHash: first.sha256 };
  const payload = { exportId: randomUUID(), exportedAt: now, classification: 'private_operator_all_access_tiers',
    coverage: { batteryItemId: itemId, versionCount: 2, firstVersionNo: 1, lastVersionNo: 2,
      sourceDocumentBytesIncluded: false, completeCustomerExitArchive: false,
      publicationTimeEvidenceMetadataAvailable: false, missingEvidenceIds: [] },
    organisation: { id: randomUUID(), legalName: 'Synthetic operator' }, model: { id: modelId },
    item: { id: itemId, modelId, publicId, passportState: 'published' }, versions: [first, second],
    evidence: [{ id: evidenceId, originalFilename: 'synthetic.txt', sizeBytes: String(bytes.length),
      sha256: createHash('sha256').update(bytes).digest('hex'), storageVersionId: 'synthetic-immutable-source-v1' }] };
  const envelope = { schema: 'eubp.operator-export.v1',
    integrity: { algorithm: 'sha256', canonicalization: 'eubp.sorted-json.v1', payloadSha256: hashJson(payload) }, payload };
  return { envelope, bytes, evidenceId };
};
