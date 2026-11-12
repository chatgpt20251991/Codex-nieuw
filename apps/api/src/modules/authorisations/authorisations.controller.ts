import { Body, ConflictException, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { AuthorisationScopeSchema, OwnTenantOnly } from '../../common/tenant/authorisation-scope.decorator';
import { currentAuthorisationEvidence } from './authorisation-evidence';
import { authorisationViewSelect, projectAuthorisation } from './authorisation-view';

const Schema = z.object({
  serviceProviderId: z.string().uuid(), evidenceId: z.string().uuid(),
  scope: AuthorisationScopeSchema, validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
}).strict();
const ListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100), cursor: z.string().uuid().optional(),
}).strict();

@Controller('authorisations')
@OwnTenantOnly()
export class AuthorisationsController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @Get() @Roles('operator_admin')
  async list(@CurrentTenant() orgId: string, @Query() query: unknown = {}) {
    const { limit, cursor } = ListSchema.parse(query);
    const rows = await this.tenantDb.run(orgId, async tx => {
      // Provider-side RLS visibility never makes another operator's grant a
      // valid position marker in this responsible operator's management list.
      if (cursor) await tx.writtenAuthorisation.findFirstOrThrow({
        where: { id: cursor, responsibleOperatorId: orgId }, select: { id: true },
      });
      return tx.writtenAuthorisation.findMany({
        where: { responsibleOperatorId: orgId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: authorisationViewSelect, take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    });
    return rows.map(projectAuthorisation);
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
      // A concurrent rejection/supersession must serialize with grant issuance.
      // Read the current attestation only after holding this exact tenant row.
      await tx.$queryRaw`SELECT "id" FROM "EvidenceObject"
        WHERE "id" = ${b.evidenceId} AND "organisationId" = ${orgId} FOR SHARE`;
      const evidence = await tx.evidenceObject.findFirstOrThrow({ where: { id: b.evidenceId, organisationId: orgId } });
      if (!currentAuthorisationEvidence(evidence, orgId, b.evidenceId)) {
        throw new ConflictException({ code: 'VERIFIED_AUTHORISATION_EVIDENCE_REQUIRED' });
      }
      if (evidence.expiresAt && (!validUntil || validUntil > evidence.expiresAt || validFrom >= evidence.expiresAt)) {
        throw new ConflictException({ code: 'AUTHORISATION_EXCEEDS_EVIDENCE_VALIDITY' });
      }
      const row = await tx.writtenAuthorisation.create({ data: {
        responsibleOperatorId: orgId, serviceProviderId: b.serviceProviderId, scopeJson: b.scope,
        documentObjectKey: evidence.objectKey, documentSha256: evidence.sha256, validFrom, validUntil,
      }, select: authorisationViewSelect });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'authorisation.create', resourceType: 'written_authorisation', resourceId: row.id,
        metadata: { serviceProviderId: b.serviceProviderId, scope: b.scope,
          validFrom: validFrom.toISOString(), validUntil: validUntil?.toISOString() ?? null } } });
      return projectAuthorisation(row);
    });
  }

  @Post(':id/revoke') @Roles('operator_admin')
  async revoke(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('id') id: string) {
    this.requireResponsibleOperator(orgId, actor);
    const grantId = z.string().uuid().parse(id);
    return this.tenantDb.run(orgId, async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WrittenAuthorisation"
        WHERE "id" = ${grantId} AND "responsibleOperatorId" = ${orgId} FOR UPDATE`;
      const existing = await tx.writtenAuthorisation.findFirstOrThrow({
        where: { id: grantId, responsibleOperatorId: orgId }, select: authorisationViewSelect,
      });
      if (existing.revokedAt) return projectAuthorisation(existing);
      const row = await tx.writtenAuthorisation.update({
        where: { id: grantId }, data: { revokedAt: new Date() }, select: authorisationViewSelect,
      });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'authorisation.revoke', resourceType: 'written_authorisation', resourceId: grantId,
        metadata: { serviceProviderId: existing.serviceProviderId, scope: existing.scopeJson,
          validFrom: existing.validFrom.toISOString(), validUntil: existing.validUntil?.toISOString() ?? null,
          revokedAt: row.revokedAt?.toISOString() } } });
      return projectAuthorisation(row);
    });
  }

  private requireResponsibleOperator(orgId: string, actor: Actor) {
    if (actor.organisationId !== orgId) throw new ForbiddenException({ code: 'RESPONSIBLE_OPERATOR_REQUIRED' });
  }
}
