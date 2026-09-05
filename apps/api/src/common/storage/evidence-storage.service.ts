import { ConflictException, Injectable } from '@nestjs/common';
import type { EvidenceObject } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TenantDbService } from '../tenant/tenant-db.service';
import { StorageService } from './storage.service';
import { malwareScanRequired } from './malware-scanner.service';
import { invalidatePassports, lockModel } from '../tenant/passport-lock';

export const EvidenceUploadSchema = z.object({
  originalFilename: z.string().min(1).max(240), mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  evidenceType: z.string().min(1).max(80), supplierId: z.string().uuid().optional(),
});

export function usableEvidence(evidence: Pick<EvidenceObject, 'verificationStatus' | 'expiresAt' | 'issuedAt'> & Partial<EvidenceObject>, now = Date.now()) {
  return evidence.verificationStatus === 'verified' &&
    (!malwareScanRequired() || !!(evidence.sha256 && evidence.malwareScanSha256 === evidence.sha256 &&
      evidence.malwareScannedAt && evidence.malwareScannerVersion && evidence.storageVersionId)) &&
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

  private async checkBytes(evidence: EvidenceObject, actorSubject?: string) {
    if (!evidence.sha256 || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || evidence.sizeBytes === null) {
      throw new ConflictException({ code: 'UPLOAD_METADATA_REQUIRED' });
    }
    let verification: Awaited<ReturnType<StorageService['verifyObjectSha256']>>;
    try {
      verification = await this.storage.verifyObjectSha256(evidence.objectKey, evidence.sha256, Number(evidence.sizeBytes), evidence.storageVersionId);
    } catch (error) {
      if (error instanceof ConflictException && (error.getResponse() as any)?.code === 'EVIDENCE_MALWARE_DETECTED') {
        for (let attempt = 0; ; attempt++) { try { await this.tenantDb.run(evidence.organisationId, async tx => {
          const links = await tx.evidenceLink.findMany({ where: { evidenceId: evidence.id },
            include: { passportValue: { include: { batteryItem: true } } } });
          const modelIds = [...new Set(links.map(link => link.passportValue.modelId || link.passportValue.batteryItem?.modelId).filter((id): id is string => !!id))].sort();
          for (const modelId of modelIds) await lockModel(tx, evidence.organisationId, modelId);
          // Links take their owner lock before this evidence lock as well. Reload
          // membership after locking to detect a concurrently added owner without
          // reversing the model/evidence lock order and causing a deadlock.
          await tx.$queryRaw`SELECT "id" FROM "EvidenceObject" WHERE "id" = ${evidence.id} AND "organisationId" = ${evidence.organisationId} FOR UPDATE`;
          const currentLinks = await tx.evidenceLink.findMany({ where: { evidenceId: evidence.id }, select: { passportValueId: true } });
          if (currentLinks.map(link => link.passportValueId).sort().join(',') !== links.map(link => link.passportValueId).sort().join(',')) {
            throw new ConflictException({ code: 'EVIDENCE_LINKS_CHANGED_RETRY' });
          }
          const changed = await tx.evidenceObject.updateMany({ where: { id: evidence.id, organisationId: evidence.organisationId,
            updatedAt: evidence.updatedAt, verificationStatus: evidence.verificationStatus },
            data: { verificationStatus: 'rejected', malwareScanSha256: null, malwareScannedAt: null, malwareScannerVersion: null } });
          if (changed.count !== 1) throw new ConflictException({ code: 'EVIDENCE_CHANGED_RETRY' });
          for (const link of links) await invalidatePassports(tx, evidence.organisationId, link.passportValue);
          await tx.auditEvent.create({ data: { organisationId: evidence.organisationId, actorSubject,
            action: 'evidence.malware_rejected', resourceType: 'evidence', resourceId: evidence.id,
            metadata: { sha256: evidence.sha256 } } });
        }); break; } catch (retryError) {
          if (attempt >= 2 || !(retryError instanceof ConflictException) ||
              (retryError.getResponse() as any)?.code !== 'EVIDENCE_LINKS_CHANGED_RETRY') throw retryError;
        } }
      }
      throw error;
    }
    if (!verification.ok) throw new ConflictException({ code: 'UPLOAD_CONTENT_HASH_MISMATCH' });
    return { storageChecksum: this.storage.checksumBase64(verification.actualHex), storageVersionId: verification.versionId,
      malwareScanSha256: verification.scan.scannedAt ? verification.actualHex : null,
      malwareScannedAt: verification.scan.scannedAt, malwareScannerVersion: verification.scan.scannerVersion };
  }

  private async transition(evidence: EvidenceObject, status: 'uploaded' | 'verified', actorSubject: string, checked: Awaited<ReturnType<EvidenceStorageService['checkBytes']>>) {
    return this.tenantDb.run(evidence.organisationId, async tx => {
      this.assertCurrent(evidence, status === 'uploaded');
      // A reviewer or another finalization may have changed the record during I/O.
      const changed = await tx.evidenceObject.updateMany({ where: { id: evidence.id, organisationId: evidence.organisationId,
        updatedAt: evidence.updatedAt, verificationStatus: evidence.verificationStatus },
        data: { verificationStatus: status, ...checked,
          ...(status === 'uploaded' ? { uploadedAt: new Date() } : {}) } });
      if (changed.count !== 1) throw new ConflictException({ code: 'EVIDENCE_CHANGED_RETRY' });
      await tx.auditEvent.create({ data: { organisationId: evidence.organisationId, actorSubject,
        action: status === 'uploaded' ? 'evidence.finalize' : 'evidence.verify', resourceType: 'evidence',
        resourceId: evidence.id, metadata: { sha256: evidence.sha256, size: Number(evidence.sizeBytes) } } });
      if (checked.malwareScannedAt) await tx.auditEvent.create({ data: { organisationId: evidence.organisationId, actorSubject,
        action: 'evidence.malware_clean', resourceType: 'evidence', resourceId: evidence.id,
        metadata: { sha256: checked.malwareScanSha256, scannerVersion: checked.malwareScannerVersion,
          storageVersionId: checked.storageVersionId, scannedAt: checked.malwareScannedAt.toISOString() } } });
      return tx.evidenceObject.findUniqueOrThrow({ where: { id: evidence.id } });
    });
  }

  async finalize(organisationId: string, id: string, actorSubject: string, supplierId?: string) {
    const evidence = await this.load(organisationId, id, supplierId);
    this.assertCurrent(evidence, true);
    const checksum = await this.checkBytes(evidence, actorSubject);
    // Retrying a completed upload must never downgrade a reviewer's decision.
    if (evidence.verificationStatus !== 'pending_upload' && !checksum.malwareScannedAt) return evidence;
    return this.transition(evidence, evidence.verificationStatus === 'verified' ? 'verified' : 'uploaded', actorSubject, checksum);
  }

  async verify(organisationId: string, id: string, actorSubject: string) {
    const evidence = await this.load(organisationId, id);
    this.assertCurrent(evidence);
    const checksum = await this.checkBytes(evidence, actorSubject);
    if (evidence.verificationStatus === 'verified' && !checksum.malwareScannedAt) return evidence;
    return this.transition(evidence, 'verified', actorSubject, checksum);
  }

  async forExtraction(organisationId: string, id: string, actorSubject?: string) {
    const evidence = await this.load(organisationId, id);
    this.assertCurrent(evidence);
    const checked = await this.checkBytes(evidence, actorSubject);
    // Legacy evidence gains no usable attestation merely by asking for extraction.
    return { ...evidence, ...checked };
  }
}
