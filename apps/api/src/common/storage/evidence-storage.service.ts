import { ConflictException, Injectable } from '@nestjs/common';
import type { EvidenceObject } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TenantDbService } from '../tenant/tenant-db.service';
import { StorageService } from './storage.service';

export const EvidenceUploadSchema = z.object({
  originalFilename: z.string().min(1).max(240), mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  evidenceType: z.string().min(1).max(80), supplierId: z.string().uuid().optional(),
});

export function usableEvidence(evidence: Pick<EvidenceObject, 'verificationStatus' | 'expiresAt' | 'issuedAt'>, now = Date.now()) {
  return evidence.verificationStatus === 'verified' &&
    (!evidence.expiresAt || evidence.expiresAt.getTime() > now) &&
    (!evidence.issuedAt || evidence.issuedAt.getTime() <= now);
}

@Injectable()
export class EvidenceStorageService {
  constructor(private readonly tenantDb: TenantDbService, private readonly storage: StorageService) {}

  async createUpload(organisationId: string, actorSubject: string, input: z.infer<typeof EvidenceUploadSchema>) {
    const id = randomUUID(), sha256 = input.sha256.toLowerCase();
    const objectKey = this.storage.evidenceKey(organisationId, id, input.originalFilename);
    const signed = await this.storage.createUploadUrl({ objectKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, sha256 });
    await this.tenantDb.run(organisationId, async tx => {
      if (input.supplierId) await tx.supplier.findFirstOrThrow({ where: { id: input.supplierId, organisationId } });
      await tx.evidenceObject.create({ data: { id, organisationId, supplierId: input.supplierId, objectKey,
        originalFilename: input.originalFilename, mimeType: input.mimeType, sizeBytes: BigInt(input.sizeBytes),
        sha256, evidenceType: input.evidenceType, verificationStatus: 'pending_upload' } });
      await tx.auditEvent.create({ data: { organisationId, actorSubject, action: 'evidence.upload_session',
        resourceType: 'evidence', resourceId: id, metadata: { supplierId: input.supplierId || null } } });
    });
    return { evidenceId: id, objectKey, uploadUrl: signed.url, method: 'PUT',
      requiredHeaders: { 'content-type': input.mimeType, 'x-amz-meta-sha256': sha256, 'x-amz-checksum-sha256': signed.checksumBase64 },
      expiresInSeconds: signed.expiresIn };
  }

  private load(organisationId: string, id: string, supplierId?: string) {
    return this.tenantDb.run(organisationId, tx => tx.evidenceObject.findFirstOrThrow({ where: { id, organisationId, supplierId } }));
  }

  private assertCurrent(evidence: EvidenceObject, allowPending = false) {
    const states = allowPending ? ['pending_upload', 'uploaded', 'unverified', 'verified'] : ['uploaded', 'unverified', 'verified'];
    if (!states.includes(evidence.verificationStatus)) throw new ConflictException({ code: 'EVIDENCE_NOT_READY' });
    if ((evidence.expiresAt && evidence.expiresAt.getTime() <= Date.now()) ||
        (evidence.issuedAt && evidence.issuedAt.getTime() > Date.now())) throw new ConflictException({ code: 'EVIDENCE_OUTSIDE_VALIDITY' });
  }

  private async checkBytes(evidence: EvidenceObject) {
    if (!evidence.sha256 || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || evidence.sizeBytes === null) {
      throw new ConflictException({ code: 'UPLOAD_METADATA_REQUIRED' });
    }
    const verification = await this.storage.verifyObjectSha256(evidence.objectKey, evidence.sha256, Number(evidence.sizeBytes));
    if (!verification.ok) throw new ConflictException({ code: 'UPLOAD_CONTENT_HASH_MISMATCH' });
    return this.storage.checksumBase64(verification.actualHex);
  }

  private async transition(evidence: EvidenceObject, status: 'uploaded' | 'verified', actorSubject: string, checksum: string) {
    return this.tenantDb.run(evidence.organisationId, async tx => {
      this.assertCurrent(evidence, status === 'uploaded');
      // A reviewer or another finalization may have changed the record during I/O.
      const changed = await tx.evidenceObject.updateMany({ where: { id: evidence.id, organisationId: evidence.organisationId,
        updatedAt: evidence.updatedAt, verificationStatus: evidence.verificationStatus },
        data: { verificationStatus: status, storageChecksum: checksum,
          ...(status === 'uploaded' ? { uploadedAt: new Date() } : {}) } });
      if (changed.count !== 1) throw new ConflictException({ code: 'EVIDENCE_CHANGED_RETRY' });
      await tx.auditEvent.create({ data: { organisationId: evidence.organisationId, actorSubject,
        action: status === 'uploaded' ? 'evidence.finalize' : 'evidence.verify', resourceType: 'evidence',
        resourceId: evidence.id, metadata: { sha256: evidence.sha256, size: Number(evidence.sizeBytes) } } });
      return tx.evidenceObject.findUniqueOrThrow({ where: { id: evidence.id } });
    });
  }

  async finalize(organisationId: string, id: string, actorSubject: string, supplierId?: string) {
    const evidence = await this.load(organisationId, id, supplierId);
    this.assertCurrent(evidence, true);
    const checksum = await this.checkBytes(evidence);
    // Retrying a completed upload must never downgrade a reviewer's decision.
    if (evidence.verificationStatus !== 'pending_upload') return evidence;
    return this.transition(evidence, 'uploaded', actorSubject, checksum);
  }

  async verify(organisationId: string, id: string, actorSubject: string) {
    const evidence = await this.load(organisationId, id);
    this.assertCurrent(evidence);
    const checksum = await this.checkBytes(evidence);
    if (evidence.verificationStatus === 'verified') return evidence;
    return this.transition(evidence, 'verified', actorSubject, checksum);
  }

  async forExtraction(organisationId: string, id: string) {
    const evidence = await this.load(organisationId, id);
    this.assertCurrent(evidence);
    await this.checkBytes(evidence);
    return evidence;
  }
}
