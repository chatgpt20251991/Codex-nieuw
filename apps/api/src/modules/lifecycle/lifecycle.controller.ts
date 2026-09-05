import { Body, ConflictException, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { transition } from '@eubp/rules';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { assertActive, invalidatePassports, lockItem } from '../../common/tenant/passport-lock';
import { hashJson } from '../../common/crypto/canonical';

const EventSchema = z.object({
  eventType: z.enum(['status_change', 'repair', 'accident', 'repurpose', 'reuse', 'remanufacture', 'recycle']),
  eventTime: z.string().datetime(), payload: z.record(z.string(), z.any()).default({}),
  previousPassportId: z.string().uuid().optional(),
  newLifecycleStatus: z.enum(['original', 'repurposed', 'reused', 'remanufactured', 'waste', 'recycled']).optional(),
});
const TelemetrySchema = z.object({ readings: z.array(z.object({ measuredAt: z.string().datetime(),
  metric: z.string().min(1).max(100), value: z.number().optional(), unit: z.string().max(40).optional(),
  payload: z.any().optional(), source: z.string().max(200).optional() })).min(1).max(1000) });
const statusForEvent: Record<string, string> = {
  repurpose: 'repurposed', reuse: 'reused', remanufacture: 'remanufactured', recycle: 'recycled', status_change: 'waste',
};

@Controller('lifecycle')
export class LifecycleController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @Get(':itemId/events')
  events(@CurrentTenant() orgId: string, @Param('itemId') itemId: string) {
    return this.tenantDb.run(orgId, async tx => {
      await tx.batteryItem.findFirstOrThrow({ where: { id: itemId, organisationId: orgId } });
      return tx.lifecycleEvent.findMany({ where: { organisationId: orgId, batteryItemId: itemId }, orderBy: { eventTime: 'desc' } });
    });
  }

  @Post(':itemId/events')
  async event(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor,
    @Param('itemId') itemId: string, @Body() body: unknown) {
    const b = EventSchema.parse(body);
    const lineage = ['repurpose', 'reuse', 'remanufacture'].includes(b.eventType);
    if (lineage && !b.previousPassportId) throw new ConflictException({ code: 'PRIOR_PASSPORT_REQUIRED' });
    const status = statusForEvent[b.eventType];
    if ((b.eventType === 'status_change' && b.newLifecycleStatus !== 'waste') ||
        (b.newLifecycleStatus && b.newLifecycleStatus !== status)) {
      throw new ConflictException({ code: 'LIFECYCLE_EVENT_STATUS_MISMATCH' });
    }
    return this.tenantDb.run(orgId, async tx => {
      const item = await lockItem(tx, orgId, itemId);
      assertActive(item);
      if (b.previousPassportId) {
        // This route continues the same physical item's lineage. Cross-item or
        // cross-operator transfers require a separate, explicitly authorised flow.
        const latest = await tx.passportVersion.findFirst({ where: { organisationId: orgId,
          batteryItemId: itemId, publicationState: 'published' }, orderBy: { versionNo: 'desc' } });
        if (!latest || latest.id !== b.previousPassportId) {
          throw new ConflictException({ code: 'PRIOR_PASSPORT_INVALID' });
        }
      }
      const eventTime = new Date(b.eventTime);
      const previousPassportId = b.previousPassportId || null;
      const payload = { ...b.payload, lifecycleTransition: { from: item.lifecycleStatus, to: status || item.lifecycleStatus } };
      const integrityHash = hashJson({ itemId, eventType: b.eventType, eventTime: eventTime.toISOString(), payload, previousPassportId });
      const row = await tx.lifecycleEvent.create({ data: { organisationId: orgId, batteryItemId: itemId,
        eventType: b.eventType, eventTime, payload, previousPassportId, integrityHash } });
      if (b.eventType === 'recycle') {
        transition(item.passportState, 'recycled');
        await tx.batteryItem.update({ where: { id: itemId }, data: { lifecycleStatus: 'recycled', passportState: 'recycled' } });
      } else {
        await invalidatePassports(tx, orgId, { batteryItemId: itemId });
        if (status) await tx.batteryItem.update({ where: { id: itemId }, data: { lifecycleStatus: status } });
      }
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject, action: 'lifecycle.event',
        resourceType: 'battery_item', resourceId: itemId, metadata: { eventType: b.eventType, eventId: row.id } } });
      return row;
    });
  }

  @Post(':itemId/telemetry')
  async telemetry(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor,
    @Param('itemId') itemId: string, @Body() body: unknown) {
    const b = TelemetrySchema.parse(body);
    return this.tenantDb.run(orgId, async tx => {
      assertActive(await lockItem(tx, orgId, itemId));
      for (const reading of b.readings) {
        const integrityHash = hashJson({ itemId, ...reading });
        await tx.telemetryReading.create({ data: { organisationId: orgId, batteryItemId: itemId,
          measuredAt: new Date(reading.measuredAt), metric: reading.metric, value: reading.value,
          unit: reading.unit, payload: reading.payload, source: reading.source, integrityHash } });
      }
      await invalidatePassports(tx, orgId, { batteryItemId: itemId });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject, action: 'telemetry.ingest',
        resourceType: 'battery_item', resourceId: itemId, metadata: { count: b.readings.length } } });
      return { accepted: b.readings.length };
    });
  }
}
