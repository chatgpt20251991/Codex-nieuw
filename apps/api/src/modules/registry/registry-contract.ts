import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { chunkForRegistry } from '@eubp/rules';
import { sha256Hex } from '../../common/crypto/canonical';

// Application-owned preparation format. Obtain and test official battery
// templates and semantic assets before adding an actual Registry adapter.
export const CONTRACT_VERSION = 'eubp.registry-draft.v1';
export const DRAFT_STATUS = 'draft-pending-battery-semantic-catalogue';
export const XML_NAMESPACE = 'urn:eubp:registry-draft:v1';
export const ExportRequest = z.object({ itemIds: z.array(z.string().uuid()).min(1).max(1000)
  .refine(ids => new Set(ids).size === ids.length, 'Duplicate item IDs are not allowed.') }).strict();
export type Serialization = 'json' | 'xml';
export interface PreparedRegistryRecord {
  batteryItemId: string;
  passportVersionId: string;
  upi: string;
  productIdentifier: string;
  schemaStatus: typeof DRAFT_STATUS;
  category: string;
  schemaVersion: string;
  ruleSetVersion: string;
  passportSha256: string;
}

export function xmlTextAllowed(value: string) {
  return [...value].every(character => {
    const point = character.codePointAt(0)!;
    return point === 9 || point === 10 || point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
      (point >= 0x10000 && point <= 0x10ffff);
  });
}

export function validRegistryUpi(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000 || !value.startsWith('https://') || /\s/.test(value) || value.includes('#')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.hash && xmlTextAllowed(value);
  } catch { return false; }
}

const recordSchema = z.object({ batteryItemId: z.string().uuid(), passportVersionId: z.string().uuid(),
  upi: z.string().refine(validRegistryUpi, 'An HTTPS UPI of at most 2000 characters is required.'),
  productIdentifier: z.string().min(1).refine(xmlTextAllowed, 'Identifier contains unsupported XML characters.'),
  schemaStatus: z.literal(DRAFT_STATUS), category: z.enum(['EV', 'LMT', 'INDUSTRIAL_GT_2KWH']),
  schemaVersion: z.string().refine(value => Boolean(value.trim()) && xmlTextAllowed(value)),
  ruleSetVersion: z.string().refine(value => Boolean(value.trim()) && xmlTextAllowed(value)),
  passportSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export function blockedRegistryResult() {
  return { kind: 'local_preparation', outcome: 'blocked', code: 'LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED',
    externalCorrelationId: null, registryUri: null, liveSubmissionAttempted: false } as const;
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '&#13;');
}

export function serializeRegistryDraft(records: PreparedRegistryRecord[], serialization: Serialization, correlationId: string) {
  z.string().uuid().parse(correlationId);
  z.enum(['json', 'xml']).parse(serialization);
  records = z.array(recordSchema).min(1).max(100).parse(records);
  if (new Set(records.map(record => record.upi)).size !== records.length ||
      new Set(records.map(record => record.batteryItemId)).size !== records.length) throw new Error('Duplicate Registry identifiers.');
  if (serialization === 'json') return JSON.stringify({ contractVersion: CONTRACT_VERSION, kind: 'internal_draft',
    uploadable: false, officialSchema: null, correlationId, records }, null, 2) + '\n';
  const rows = records.map(record => '    <record>\n' + Object.entries(record)
    .map(([key, value]) => `      <${key}>${escapeXml(value)}</${key}>`).join('\n') + '\n    </record>').join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<registryDraft xmlns="${XML_NAMESPACE}" contractVersion="${CONTRACT_VERSION}" kind="internal_draft" uploadable="false" correlationId="${correlationId}">\n  <officialSchema available="false"/>\n  <records>\n${rows}\n  </records>\n</registryDraft>\n`;
}

export function buildRegistryDraft(records: PreparedRegistryRecord[], serialization: Serialization,
  correlationId = randomUUID(), newBatchId: () => string = randomUUID) {
  z.string().uuid().parse(correlationId);
  records = z.array(recordSchema).min(1).max(1000).parse(records);
  if (new Set(records.map(record => record.upi)).size !== records.length ||
      new Set(records.map(record => record.batteryItemId)).size !== records.length) throw new Error('Duplicate Registry identifiers.');
  // Tenant is fixed by the calling service. This additional grouping is our
  // internal safety policy, not an invented official file schema requirement.
  const groups = new Map<string, PreparedRegistryRecord[]>();
  for (const record of records) {
    const key = JSON.stringify([record.category, record.schemaVersion, record.ruleSetVersion]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }
  const batches = [...groups.values()].flatMap(group => chunkForRegistry(group, 100));
  const files = batches.map((batch, batchIndex) => {
    const batchCorrelationId = newBatchId();
    const content = serializeRegistryDraft(batch, serialization, batchCorrelationId);
    return { batchIndex, correlationId: batchCorrelationId,
      filename: `internal-draft-${correlationId}-${batchIndex + 1}.${serialization}`,
      mediaType: serialization === 'json' ? 'application/json' : 'application/xml',
      content, sha256: sha256Hex(content), recordCount: batch.length };
  });
  return { format: 'eubp-registry-draft-export', contractVersion: CONTRACT_VERSION, serialization,
    uploadable: false, officialSchema: null, correlationId,
    warning: 'Internal preparation only. These files are not official Registry upload templates and cannot establish registration.',
    batches, files, result: blockedRegistryResult() } as const;
}
