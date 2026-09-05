import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { registryGate } from '@eubp/rules';
import type { Actor } from '../../common/auth/auth.types';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { hashJson } from '../../common/crypto/canonical';
import { PassportDataService } from '../passports/passport-data.service';
import { RegistryIdentityService } from './registry-identity.service';
import { buildRegistryDraft, CONTRACT_VERSION, DRAFT_STATUS, ExportRequest,
  type PreparedRegistryRecord, type Serialization, validRegistryUpi, xmlTextAllowed } from './registry-contract';

@Injectable()
export class RegistryPreparationService {
  constructor(private readonly tenantDb: TenantDbService, private readonly data: PassportDataService,
    private readonly identity: RegistryIdentityService) {}

  async prepare(organisationId: string, actor: Actor, body: unknown, serialization: Serialization,
    action: 'registry.export' | 'registry.prepare' | 'registry.submit_blocked' = 'registry.export') {
    const { itemIds } = ExportRequest.parse(body);
    const correlationId = randomUUID(); // Local attempt ID, never an external Registry correlation.
    const actorGate = await this.identity.gate(organisationId, actor);
    const complianceGate = registryGate({
      batterySemanticCatalogueAvailable: process.env.BATTERY_SEMANTIC_CATALOGUE_AVAILABLE === 'true',
      batteryRegistrationAvailable: process.env.REGISTRY_BATTERY_SUBMISSION_AVAILABLE === 'true',
    }, 0);
    const gate = { allowed: false, code: 'LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED',
      message: 'Only internal draft preparation is available; no live Registry request was sent.', complianceGate, actorGate };

    const outcome = await this.tenantDb.run(organisationId, async tx => {
      const candidates = await tx.batteryItem.findMany({ where: { organisationId, id: { in: itemIds } },
        select: { id: true, modelId: true } });
      // Lock the candidate set in stable model-first order, matching Gate 5.
      if (candidates.length) {
        const modelIds = [...new Set(candidates.map(item => item.modelId))].sort();
        await tx.$queryRaw`SELECT "id" FROM "BatteryModel" WHERE "organisationId" = ${organisationId}
          AND "id" IN (${Prisma.join(modelIds)}) ORDER BY "id" FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "BatteryItem" WHERE "organisationId" = ${organisationId}
          AND "id" IN (${Prisma.join(candidates.map(item => item.id).sort())}) ORDER BY "id" FOR UPDATE`;
      }
      const found = new Set(candidates.map(item => item.id));
      const invalid: Array<{ itemId: string; code: string }> = [];
      const records: PreparedRegistryRecord[] = [];
      const upis = new Set<string>();
      for (const itemId of itemIds) {
        // Absent and foreign IDs deliberately receive the same response.
        if (!found.has(itemId)) { invalid.push({ itemId, code: 'ITEM_NOT_AVAILABLE' }); continue; }
        const validation = await this.data.validateTx(tx, organisationId, itemId);
        const item = validation.item;
        const latest = await tx.passportVersion.findFirst({ where: { organisationId, batteryItemId: itemId,
          publicationState: 'published' }, orderBy: { versionNo: 'desc' } });
        let code: string | undefined;
        if (!latest) code = 'NO_PUBLISHED_PASSPORT';
        else if (!['published', 'registered', 'registry_pending'].includes(item.passportState)) code = 'PASSPORT_NOT_CURRENT';
        else if (!validation.publishable) code = 'COMPLIANCE_BLOCKERS';
        else if (!validRegistryUpi(item.upi)) code = 'INVALID_REGISTRY_UPI';
        else if (!item.serialOrItemIdentifier || !xmlTextAllowed(item.serialOrItemIdentifier)) code = 'INVALID_PRODUCT_IDENTIFIER';
        else {
          const canonical = latest.canonicalJson as { schema?: unknown; ruleSetVersion?: unknown;
            battery?: { upi?: unknown; serial?: unknown; category?: unknown } };
          if (canonical?.battery?.upi !== item.upi || canonical?.battery?.serial !== item.serialOrItemIdentifier ||
              canonical?.battery?.category !== item.model.category || canonical?.schema !== latest.schemaVersion ||
              canonical?.ruleSetVersion !== latest.ruleSetVersion || hashJson(latest.canonicalJson) !== latest.sha256)
            code = 'PUBLISHED_IDENTITY_MISMATCH';
          else if (!latest.schemaVersion.trim() || !latest.ruleSetVersion.trim() ||
              !xmlTextAllowed(latest.schemaVersion) || !xmlTextAllowed(latest.ruleSetVersion) ||
              !['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'].includes(item.model.category)) code = 'INVALID_CONTRACT_METADATA';
          else if (upis.has(item.upi!)) code = 'DUPLICATE_UPI';
        }
        if (code) invalid.push({ itemId, code });
        else {
          upis.add(item.upi!);
          records.push({ batteryItemId: item.id, passportVersionId: latest!.id, upi: item.upi!,
            productIdentifier: item.serialOrItemIdentifier, schemaStatus: DRAFT_STATUS,
            category: item.model.category, schemaVersion: latest!.schemaVersion,
            ruleSetVersion: latest!.ruleSetVersion, passportSha256: latest!.sha256 });
        }
      }
      if (invalid.length) {
        await tx.auditEvent.create({ data: { organisationId, actorSubject: actor.subject,
          action: 'registry.prevalidation_rejected', resourceType: 'registry_export', resourceId: correlationId,
          metadata: { requestedCount: itemIds.length, invalid, kind: 'local_prevalidation', liveSubmissionAttempted: false } } });
        return { rejected: true as const, invalid };
      }
      // Persist/return no records or files until the complete candidate set passes.
      const draft = buildRegistryDraft(records, serialization, correlationId);
      const submissions: Prisma.RegistrySubmissionCreateManyInput[] = [];
      for (const file of draft.files) {
        for (const [recordIndex, record] of draft.batches[file.batchIndex].entries()) submissions.push({ id: randomUUID(), organisationId,
          batteryItemId: record.batteryItemId, passportVersionId: record.passportVersionId,
          method: `internal_draft_${serialization}`, correlationId, status: 'blocked',
          requestPayload: { contractVersion: CONTRACT_VERSION, serialization, batchIndex: file.batchIndex, recordIndex,
            batchCorrelationId: file.correlationId, record, recordSha256: hashJson(record), fileSha256: file.sha256 } as unknown as Prisma.InputJsonValue,
          responsePayload: { ...draft.result }, errorReport: { gate }, completedAt: new Date() });
      }
      await tx.registrySubmission.createMany({ data: submissions });
      await tx.auditEvent.create({ data: { organisationId, actorSubject: actor.subject, action,
        resourceType: 'registry_export', resourceId: correlationId,
        metadata: { serialization, requestedCount: itemIds.length, fileCount: draft.files.length,
          fileHashes: draft.files.map(file => file.sha256), result: draft.result } } });
      const submission = action === 'registry.prepare' ? await tx.registrySubmission.findFirstOrThrow({
        where: { id: submissions[0].id, organisationId } }) : undefined;
      return { rejected: false as const, draft, submission };
    }, { timeout: 60000 }); // Only this bounded 1..1000-item operation extends the default timeout.
    if (outcome.rejected) throw new ConflictException({ code: 'REGISTRY_PREVALIDATION_FAILED', correlationId, invalid: outcome.invalid });
    return { ...outcome.draft, ...(outcome.submission ? { submission: outcome.submission } : {}), gate };
  }

  async get(organisationId: string, correlationId: string) {
    const submissions = await this.tenantDb.run(organisationId, tx => tx.registrySubmission.findMany({
      where: { organisationId, correlationId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
    if (!submissions.length) {
      const rejected = await this.tenantDb.run(organisationId, tx => tx.auditEvent.findFirst({ where: {
        organisationId, resourceType: 'registry_export', resourceId: correlationId, action: 'registry.prevalidation_rejected' } }));
      if (!rejected) throw new NotFoundException();
      const metadata = rejected.metadata as Prisma.JsonObject;
      return { correlationId, submissions: [], result: { kind: 'local_prevalidation', outcome: 'rejected',
        code: 'REGISTRY_PREVALIDATION_FAILED', externalCorrelationId: null, registryUri: null, liveSubmissionAttempted: false },
        errorReport: { invalid: metadata.invalid, requestedCount: metadata.requestedCount } };
    }
    submissions.sort((a, b) => {
      const left = a.requestPayload as Prisma.JsonObject, right = b.requestPayload as Prisma.JsonObject;
      return Number(left?.batchIndex ?? 0) - Number(right?.batchIndex ?? 0) ||
        Number(left?.recordIndex ?? 0) - Number(right?.recordIndex ?? 0);
    });
    return { correlationId, submissions };
  }
}
