import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { delegatedContext } from './delegated-context';
import { permitsAuthorisationScope } from './authorisation-scope.decorator';

@Injectable()
export class TenantDbService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(organisationId: string, work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { timeout: number }): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const delegation = delegatedContext.getStore();
      if (delegation && organisationId !== delegation.providerOrganisationId && organisationId !== delegation.responsibleOrganisationId) {
        throw new ForbiddenException({ code: 'DELEGATED_TENANT_MISMATCH' });
      }
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organisationId}, true)`;
      if (delegation && organisationId !== delegation.providerOrganisationId) {
        // Lock before rereading: revocation waits for an already authorised DB
        // operation, and revocation between the guard and this transaction fails.
        // The responsible context admits its UPDATE/row-lock RLS policy; no
        // customer work executes until the exact provider grant is rechecked.
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "WrittenAuthorisation"
          WHERE id = ${delegation.authorisationId} AND "responsibleOperatorId" = ${organisationId}
          AND "serviceProviderId" = ${delegation.providerOrganisationId} FOR SHARE`;
        if (locked.length !== 1) throw new ForbiddenException({ code: 'NO_WRITTEN_AUTHORISATION' });
        const now = new Date();
        const grant = await tx.writtenAuthorisation.findFirst({ where: { id: delegation.authorisationId,
          responsibleOperatorId: organisationId, serviceProviderId: delegation.providerOrganisationId,
          revokedAt: null, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          scopeJson: { path: [delegation.requiredScope], equals: true } } });
        if (!grant || !permitsAuthorisationScope(grant.scopeJson, delegation.requiredScope)) {
          throw new ForbiddenException({ code: 'NO_WRITTEN_AUTHORISATION', message: 'The delegated action is no longer authorised.' });
        }
      }
      const result = await work(tx);
      if (delegation && organisationId === delegation.responsibleOrganisationId) {
        await tx.auditEvent.create({ data: { organisationId, actorSubject: delegation.actorSubject,
          action: 'authorisation.scoped_transaction', resourceType: 'written_authorisation', resourceId: delegation.authorisationId,
          requestId: delegation.requestId, metadata: { scope: delegation.requiredScope,
            serviceProviderId: delegation.providerOrganisationId, handler: delegation.handler } } });
      }
      return result;
    }, options);
  }
}
