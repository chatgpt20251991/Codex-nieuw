import { ConflictException, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { fields, transition } from '@eubp/rules';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { assertActive, lockItem } from '../../common/tenant/passport-lock';
import { canonicalize, sha256Hex } from '../../common/crypto/canonical';
import { ResolverService } from '../resolver/resolver.service';
import { PassportDataService } from './passport-data.service';
import { projectPassport } from './passport-projection';

@Controller('passports')
export class PassportsController {
  constructor(private readonly tenantDb: TenantDbService, private readonly data: PassportDataService,
    private readonly resolver: ResolverService) {}

  @Post(':itemId/validate')
  async validate(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('itemId') itemId: string) {
    return this.tenantDb.run(orgId, async tx => {
      const item = await lockItem(tx, orgId, itemId);
      assertActive(item);
      const result = await this.data.validateTx(tx, orgId, itemId);
      // Rechecking an unchanged publication must not enable a duplicate version
      // or erase a genuine Registry state.
      const published = ['published', 'registered', 'registry_pending'].includes(item.passportState);
      const target = published ? (result.publishable ? item.passportState : 'updated') :
        (result.publishable ? 'ready' : 'validation_failed');
      const current = item.passportState === 'draft' ? transition('draft', 'data_collection') : item.passportState;
      if (current !== target) transition(current, target);
      await tx.batteryItem.update({ where: { id: itemId }, data: { passportState: target } });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'passport.validate', resourceType: 'battery_item', resourceId: itemId,
        metadata: { publishable: result.publishable, blockers: result.publicationBlockers.length } } });
      return { ...result, item: undefined, values: undefined };
    });
  }

  @Get(':itemId/validate')
  validateReadOnly(@CurrentTenant() orgId: string, @Param('itemId') itemId: string) {
    return this.data.validate(orgId, itemId).then(result => ({ ...result, item: undefined, values: undefined }));
  }

  @Post(':itemId/publish')
  async publish(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('itemId') itemId: string) {
    return this.tenantDb.run(orgId, async tx => {
      const locked = await lockItem(tx, orgId, itemId);
      assertActive(locked);
      if (!['ready', 'updated'].includes(locked.passportState)) {
        throw new ConflictException({ code: 'PASSPORT_NOT_READY', state: locked.passportState,
          message: 'Run validation before publishing.' });
      }
      // Validate and serialize the same locked data. A value cannot be replaced
      // by an unvalidated value between these operations.
      const validation = await this.data.validateTx(tx, orgId, itemId);
      if (!validation.publishable) throw new ConflictException({ code: 'PASSPORT_NOT_PUBLISHABLE',
        readiness: validation.readiness, blockers: validation.publicationBlockers });
      const { item, values } = validation;
      transition(item.passportState, 'published');
      const upi = item.upi || this.resolver.upi(item.publicId);
      const latest = await tx.passportVersion.findFirst({ where: { organisationId: orgId, batteryItemId: itemId },
        orderBy: { versionNo: 'desc' } });
      const defs = new Map(fields.map(field => [field.id, field]));
      const canonical = {
        schema: 'eubatterypassport.v2', ruleSetVersion: process.env.REGULATORY_RULESET_VERSION || 'EU-BR-2026.08',
        generatedAt: new Date().toISOString(),
        battery: { publicId: item.publicId, id: item.id, modelId: item.modelId, modelIdentifier: item.model.modelIdentifier,
          serial: item.serialOrItemIdentifier, batch: item.batchIdentifier, upi, category: item.model.category,
          lifecycleStatus: item.lifecycleStatus },
        values: values.map(value => ({ fieldId: value.fieldDefinitionId, name: defs.get(value.fieldDefinitionId)?.name,
          value: value.valueJson, unit: value.unit, accessTier: defs.get(value.fieldDefinitionId)?.access_tier,
          validationStatus: value.validationStatus, sourceKind: value.sourceKind,
          evidenceIds: value.evidenceLinks.map((link: any) => link.evidenceId) })).sort((a, b) => a.fieldId - b.fieldId),
      };
      const sha256 = sha256Hex(canonicalize(canonical));
      const row = await tx.passportVersion.create({ data: { organisationId: orgId, batteryItemId: itemId,
        versionNo: (latest?.versionNo || 0) + 1, ruleSetVersion: canonical.ruleSetVersion, canonicalJson: canonical,
        sha256, previousVersionHash: latest?.sha256, publicationState: 'published', publishedAt: new Date() } });
      const publicJson = projectPassport(canonical);
      const publicHash = sha256Hex(canonicalize(publicJson));
      await tx.publicPassportSnapshot.updateMany({ where: { organisationId: orgId, batteryItemId: itemId, active: true },
        data: { active: false } });
      await tx.publicPassportSnapshot.create({ data: { organisationId: orgId, batteryItemId: itemId,
        passportVersionId: row.id, publicId: item.publicId, upi, publicJson, sha256: publicHash, active: true } });
      await tx.batteryItem.update({ where: { id: itemId }, data: { passportState: 'published', upi } });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'passport.publish', resourceType: 'passport_version', resourceId: row.id,
        metadata: { batteryItemId: itemId, versionNo: row.versionNo, sha256: row.sha256 } } });
      return { version: row, publicId: item.publicId, upi, publicHash };
    });
  }

  @Get(':itemId/versions')
  versions(@CurrentTenant() orgId: string, @Param('itemId') itemId: string) {
    return this.tenantDb.run(orgId, tx => tx.passportVersion.findMany({ where: { organisationId: orgId, batteryItemId: itemId },
      select: { id: true, versionNo: true, ruleSetVersion: true, sha256: true, previousVersionHash: true,
        publicationState: true, publishedAt: true, createdAt: true }, orderBy: { versionNo: 'desc' } }));
  }

  @Get(':itemId/qr.svg') @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  async qr(@CurrentTenant() orgId: string, @Param('itemId') itemId: string) {
    const item = await this.tenantDb.run(orgId, tx => tx.batteryItem.findFirstOrThrow({ where: { id: itemId, organisationId: orgId } }));
    return this.resolver.qrSvg(item.upi || this.resolver.upi(item.publicId));
  }
}
