import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantDbService } from './tenant-db.service';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AUTHORISATION_SCOPE_KEY } from './authorisation-scope.decorator';
import { permitsAuthorisationScope, type AuthorisationScope } from './authorisation-scope.decorator';
import { randomUUID } from 'node:crypto';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenantDb: TenantDbService) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const actor = req.actor;
    const requested = String(req.headers['x-acting-organisation-id'] || actor.organisationId);
    if (requested === actor.organisationId) {
      req.tenantOrganisationId = requested;
      return true;
    }

    const requiredScope = this.reflector.getAllAndOverride<AuthorisationScope | null>(AUTHORISATION_SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!requiredScope) throw new ForbiddenException({ code: 'DELEGATION_NOT_ALLOWED', message: 'This action requires the responsible organisation.' });
    const now = new Date();
    const authorisations = await this.tenantDb.run(actor.organisationId, tx => tx.writtenAuthorisation.findMany({
      where: {
        responsibleOperatorId: requested,
        serviceProviderId: actor.organisationId,
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        // Filter before choosing a record: an unrelated active authorisation
        // must not hide a second active grant with the required Boolean scope.
        scopeJson: { path: [requiredScope], equals: true },
      },
      orderBy: { id: 'asc' },
    }));
    const authorisation = authorisations.find(grant => permitsAuthorisationScope(grant.scopeJson, requiredScope));
    if (!authorisation) {
      throw new ForbiddenException({ code: 'NO_WRITTEN_AUTHORISATION', message: 'No active written authorisation exists for the requested organisation.' });
    }
    req.tenantOrganisationId = requested;
    req.writtenAuthorisationId = authorisation.id;
    req.delegation = { authorisationId: authorisation.id, providerOrganisationId: actor.organisationId,
      responsibleOrganisationId: requested, actorSubject: actor.subject, requiredScope,
      requestId: randomUUID(), handler: `${ctx.getClass().name}.${ctx.getHandler().name}` };
    return true;
  }
}
