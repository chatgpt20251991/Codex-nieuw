import type { EvidenceObject } from '@prisma/client';
import { usableEvidence } from '../../common/storage/evidence-storage.service';

const finiteDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

/** A verified flag alone never establishes a safe written-mandate source.
 * Unlike the development evidence pipeline, new delegations have no scanner
 * bypass. Reuse the ordinary validity rule and require its complete immutable,
 * byte/hash-bound clean-scan attestation in every environment.
 */
export function currentAuthorisationEvidence(evidence: EvidenceObject,
  organisationId: string, evidenceId: string, now = Date.now()): evidence is EvidenceObject & { sha256: string } {
  if (evidence.id !== evidenceId || evidence.organisationId !== organisationId ||
      !evidence.sha256 || !/^[a-f0-9]{64}$/.test(evidence.sha256) ||
      typeof evidence.sizeBytes !== 'bigint' || evidence.sizeBytes <= 0n ||
      evidence.sizeBytes > 100n * 1024n * 1024n ||
      !finiteDate(evidence.uploadedAt) || evidence.uploadedAt.getTime() > now ||
      !finiteDate(evidence.malwareScannedAt) || evidence.malwareScannedAt.getTime() > now ||
      (evidence.issuedAt !== null && !finiteDate(evidence.issuedAt)) ||
      (evidence.expiresAt !== null && !finiteDate(evidence.expiresAt)) ||
      evidence.malwareScanSha256 !== evidence.sha256 ||
      evidence.storageChecksum !== Buffer.from(evidence.sha256, 'hex').toString('base64') ||
      !evidence.malwareScannerVersion || !/^ClamAV \d+\.\d+\.\d+\/\d+\/[^\r\n]+$/.test(evidence.malwareScannerVersion) ||
      !evidence.storageVersionId?.trim() || evidence.storageVersionId.trim() !== evidence.storageVersionId ||
      evidence.storageVersionId === 'null' ||
      !evidence.objectKey.startsWith(`orgs/${organisationId}/evidence/${evidenceId}/`)) return false;
  return usableEvidence(evidence, now);
}
