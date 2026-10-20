import { ConflictException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { lockItem } from '../../common/tenant/passport-lock';
import { hashJson } from '../../common/crypto/canonical';

export const OPERATOR_EXPORT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_VERSIONS = 256;
const MAX_EVIDENCE = 5000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PassportExportService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async export(organisationId: string, itemId: string, actorSubject: string) {
    return this.tenantDb.run(organisationId, async tx => {
      // Keep publication/value writers on the established model -> item lock order.
      // Closed lifecycle items may still be exported; this is not a publication.
      const item = await lockItem(tx, organisationId, itemId);
      const size = await tx.$queryRaw<Array<{ count: bigint; bytes: bigint }>>`
        SELECT COUNT(*)::bigint AS count,
          COALESCE(SUM(octet_length("canonicalJson"::text)), 0)::bigint AS bytes
        FROM "PassportVersion" WHERE "organisationId" = ${organisationId}
        AND "batteryItemId" = ${itemId}`;
      if (!size[0] || size[0].count === 0n) throw new ConflictException({ code: 'EXPORT_PUBLICATION_REQUIRED' });
      if (size[0].count > BigInt(MAX_VERSIONS) || size[0].bytes > BigInt(OPERATOR_EXPORT_MAX_BYTES)) {
        throw new PayloadTooLargeException({ code: 'EXPORT_LIMIT_EXCEEDED', message: 'A reviewed offline export is required for this history.' });
      }
      const organisation = await tx.organisation.findFirstOrThrow({ where: { id: organisationId },
        select: { id: true, legalName: true, countryCode: true, role: true, verificationStatus: true } });
      const model = await tx.batteryModel.findFirstOrThrow({ where: { id: item.modelId, organisationId },
        select: { id: true, modelIdentifier: true, category: true, name: true, chemistry: true,
          applicabilityContext: true, lifecycleStatus: true, createdAt: true, updatedAt: true } });
      const versions = await tx.passportVersion.findMany({ where: { organisationId, batteryItemId: itemId },
        orderBy: { versionNo: 'asc' }, take: MAX_VERSIONS + 1,
        select: { id: true, versionNo: true, schemaVersion: true, ruleSetVersion: true, canonicalJson: true,
          sha256: true, previousVersionHash: true, publicationState: true, publishedAt: true, createdAt: true } });
      const evidenceIds = new Set<string>();
      let previous: string | null = null;
      for (const [index, version] of versions.entries()) {
        const canonical = version.canonicalJson as any;
        if (version.versionNo !== index + 1 || version.previousVersionHash !== previous ||
            version.publicationState !== 'published' || !version.publishedAt || hashJson(canonical) !== version.sha256 ||
            canonical?.schema !== version.schemaVersion || canonical?.ruleSetVersion !== version.ruleSetVersion ||
            canonical?.battery?.id !== item.id || canonical?.battery?.modelId !== model.id ||
            canonical?.battery?.publicId !== item.publicId || !Array.isArray(canonical?.values)) {
          throw new ConflictException({ code: 'EXPORT_VERSION_INTEGRITY_FAILED' });
        }
        for (const value of canonical.values) {
          if (!Array.isArray(value?.evidenceIds)) throw new ConflictException({ code: 'EXPORT_VERSION_INTEGRITY_FAILED' });
          for (const id of value.evidenceIds) {
            if (typeof id !== 'string' || !uuid.test(id)) throw new ConflictException({ code: 'EXPORT_VERSION_INTEGRITY_FAILED' });
            evidenceIds.add(id);
          }
        }
        previous = version.sha256;
      }
      if (versions.length !== Number(size[0].count) || evidenceIds.size > MAX_EVIDENCE) {
        throw new PayloadTooLargeException({ code: 'EXPORT_LIMIT_EXCEEDED' });
      }
      // Explicit projection: no storage credentials, object keys, supplier links,
      // capability hashes, contact data, Registry credentials or extraction payloads.
      const evidenceRows = await tx.evidenceObject.findMany({
        where: { organisationId, id: { in: [...evidenceIds] } }, orderBy: { id: 'asc' },
        select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true, sha256: true,
          storageChecksum: true, storageVersionId: true, evidenceType: true, verificationStatus: true,
          issuedAt: true, expiresAt: true, uploadedAt: true, malwareScanSha256: true,
          malwareScannedAt: true, malwareScannerVersion: true, createdAt: true, updatedAt: true } });
      const evidence = evidenceRows.map(row => ({ ...row, sizeBytes: row.sizeBytes?.toString() ?? null }));
      const found = new Set(evidence.map(row => row.id));
      const missingEvidenceIds = [...evidenceIds].filter(id => !found.has(id)).sort();
      const exportId = randomUUID(), exportedAt = new Date().toISOString();
      const payload = {
        exportId, exportedAt, classification: 'private_operator_all_access_tiers',
        coverage: { batteryItemId: item.id, versionCount: versions.length, firstVersionNo: 1,
          lastVersionNo: versions.length, sourceDocumentBytesIncluded: false, completeCustomerExitArchive: false,
          evidenceMetadataAsOf: exportedAt, publicationTimeEvidenceMetadataAvailable: false,
          missingEvidenceIds,
          exclusions: ['source_document_bytes', 'draft_and_current_values', 'audit_log', 'lifecycle_events_and_telemetry',
            'supplier_submissions_and_contacts', 'registry_submissions', 'resolver_and_domain_transfer',
            'access_grants_and_credentials', 'restoration_and_successor_service_configuration'],
          notice: 'Private export of published versions and current referenced evidence metadata. Hashes check internal consistency, not authenticity or regulatory compliance. This is not a complete customer-exit archive.' },
        organisation, model, item: { id: item.id, publicId: item.publicId, modelId: item.modelId,
          serialOrItemIdentifier: item.serialOrItemIdentifier, batchIdentifier: item.batchIdentifier,
          upi: item.upi, manufactureDate: item.manufactureDate, lifecycleStatus: item.lifecycleStatus,
          passportState: item.passportState, createdAt: item.createdAt, updatedAt: item.updatedAt },
        versions, evidence,
      };
      const envelope = { schema: 'eubp.operator-export.v1',
        integrity: { algorithm: 'sha256', canonicalization: 'eubp.sorted-json.v1', payloadSha256: hashJson(payload) }, payload };
      if (Buffer.byteLength(JSON.stringify(envelope), 'utf8') > OPERATOR_EXPORT_MAX_BYTES) {
        throw new PayloadTooLargeException({ code: 'EXPORT_LIMIT_EXCEEDED' });
      }
      await tx.auditEvent.create({ data: { organisationId, actorSubject, action: 'passport.operator_export_issued',
        resourceType: 'battery_item', resourceId: item.id, metadata: { exportId,
          payloadSha256: envelope.integrity.payloadSha256, versionCount: versions.length,
          evidenceCount: evidence.length, missingEvidenceCount: missingEvidenceIds.length,
          sourceDocumentBytesIncluded: false, completeCustomerExitArchive: false } } });
      return envelope;
    }, { timeout: 15000 });
  }
}
