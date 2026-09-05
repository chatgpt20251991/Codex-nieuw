import { Injectable } from '@nestjs/common';
import { delegatedRegistryActorGate } from '@eubp/rules';
import type { Actor } from '../../common/auth/auth.types';
import { TenantDbService } from '../../common/tenant/tenant-db.service';

@Injectable()
export class RegistryIdentityService {
  constructor(private readonly tenantDb: TenantDbService) {}

  private async getIdentity(organisationId: string, actorType: 'economic_operator' | 'value_chain_actor') {
    return this.tenantDb.run(organisationId, (tx) => tx.registryIdentity.findUnique({
      where: { organisationId_actorType: { organisationId, actorType } },
    }));
  }

  async gate(responsibleOrganisationId: string, actor: Actor) {
    const actingOnBehalf = actor.organisationId !== responsibleOrganisationId;
    const responsible = await this.getIdentity(responsibleOrganisationId, 'economic_operator');
    const acting = actingOnBehalf
      ? await this.getIdentity(actor.organisationId, 'value_chain_actor')
      : responsible;

    const now = new Date();
    const authorisation = actingOnBehalf
      ? await this.tenantDb.run(actor.organisationId, tx => tx.writtenAuthorisation.findFirst({
          where: {
            responsibleOperatorId: responsibleOrganisationId,
            serviceProviderId: actor.organisationId,
            revokedAt: null,
            validFrom: { lte: now },
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          },
        }))
      : null;

    const result = delegatedRegistryActorGate({
      responsibleOperator: responsible ? {
        actorType: 'economic_operator',
        status: responsible.status,
        verifiedAt: responsible.verifiedAt ?? undefined,
        validUntil: responsible.validUntil ?? undefined,
        electronicIdExpiresAt: responsible.electronicIdExpiresAt ?? undefined,
      } : { actorType: 'economic_operator', status: 'unverified' },
      actingParty: acting ? {
        actorType: actingOnBehalf ? 'value_chain_actor' : 'economic_operator',
        status: acting.status,
        verifiedAt: acting.verifiedAt ?? undefined,
        validUntil: acting.validUntil ?? undefined,
        electronicIdExpiresAt: acting.electronicIdExpiresAt ?? undefined,
      } : { actorType: actingOnBehalf ? 'value_chain_actor' : 'economic_operator', status: 'unverified' },
      actingOnBehalf,
      hasActiveWrittenAuthorisation: !actingOnBehalf || Boolean(authorisation),
      now,
    });

    return {
      ...result,
      actingOnBehalf,
      responsibleRegistryIdentityId: responsible?.id ?? null,
      actingRegistryIdentityId: acting?.id ?? null,
      writtenAuthorisationId: authorisation?.id ?? null,
    };
  }
}
