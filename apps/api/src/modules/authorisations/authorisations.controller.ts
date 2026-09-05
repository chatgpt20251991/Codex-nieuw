import { Body, ConflictException, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';

const Schema = z.object({
  serviceProviderId: z.string().uuid(), evidenceId: z.string().uuid(),
  scope: z.record(z.string(), z.any()), validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

@Controller('authorisations')
export class AuthorisationsController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @Get()
  list(@CurrentTenant() orgId: string) {
    return this.tenantDb.run(orgId, tx => tx.writtenAuthorisation.findMany({
      where: { responsibleOperatorId: orgId }, orderBy: { createdAt: 'desc' },
    }));
  }

  @Post() @Roles('operator_admin')
  async create(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Body() body: unknown) {
    this.requireResponsibleOperator(orgId, actor);
    const b = Schema.parse(body);
    const validFrom = b.validFrom ? new Date(b.validFrom) : new Date();
    const validUntil = b.validUntil ? new Date(b.validUntil) : null;
    if (validUntil && validUntil <= validFrom) throw new ConflictException({ code: 'INVALID_AUTHORISATION_INTERVAL' });
    if (b.serviceProviderId === orgId) throw new ConflictException({ code: 'SELF_AUTHORISATION' });
    return this.tenantDb.run(orgId, async tx => {
      const evidence = await tx.evidenceObject.findFirstOrThrow({ where: { id: b.evidenceId, organisationId: orgId } });
      if (evidence.verificationStatus !== 'verified' || !evidence.sha256) {
        throw new ConflictException({ code: 'VERIFIED_AUTHORISATION_EVIDENCE_REQUIRED' });
      }
      const row = await tx.writtenAuthorisation.create({ data: {
        responsibleOperatorId: orgId, serviceProviderId: b.serviceProviderId, scopeJson: b.scope,
        documentObjectKey: evidence.objectKey, documentSha256: evidence.sha256, validFrom, validUntil,
      } });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'authorisation.create', resourceType: 'written_authorisation', resourceId: row.id,
        metadata: { serviceProviderId: b.serviceProviderId } } });
      return row;
    });
  }

  @Post(':id/revoke') @Roles('operator_admin')
  async revoke(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('id') id: string) {
    this.requireResponsibleOperator(orgId, actor);
    return this.tenantDb.run(orgId, async tx => {
      const existing = await tx.writtenAuthorisation.findFirstOrThrow({ where: { id, responsibleOperatorId: orgId } });
      const row = await tx.writtenAuthorisation.update({ where: { id }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'authorisation.revoke', resourceType: 'written_authorisation', resourceId: id,
        metadata: { serviceProviderId: existing.serviceProviderId } } });
      return row;
    });
  }

  private requireResponsibleOperator(orgId: string, actor: Actor) {
    if (actor.organisationId !== orgId) throw new ForbiddenException({ code: 'RESPONSIBLE_OPERATOR_REQUIRED' });
  }
}