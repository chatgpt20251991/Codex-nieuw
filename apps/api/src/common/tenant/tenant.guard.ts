import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantDbService } from './tenant-db.service';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AUTHORISATION_SCOPE_KEY } from './authorisation-scope.decorator';

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

    const requiredScope = this.reflector.getAllAndOverride<'evidenceReview'>(AUTHORISATION_SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
    const now = new Date();
    const authorisation = await this.tenantDb.run(actor.organisationId, tx => tx.writtenAuthorisation.findFirst({
      where: {
        responsibleOperatorId: requested,
        serviceProviderId: actor.organisationId,
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        // Filter before choosing a record: an unrelated active authorisation
        // must not hide a second active grant with the required Boolean scope.
        ...(requiredScope ? { scopeJson: { path: [requiredScope], equals: true } } : {}),
      },
    }));
    const scope = authorisation?.scopeJson;
    const scopeAllowed = !requiredScope || (!!scope && typeof scope === 'object' && !Array.isArray(scope) &&
      Object.prototype.hasOwnProperty.call(scope, requiredScope) && scope[requiredScope] === true);
    if (!authorisation || !scopeAllowed) {
      throw new ForbiddenException({ code: 'NO_WRITTEN_AUTHORISATION', message: 'No active written authorisation exists for the requested organisation.' });
    }
    req.tenantOrganisationId = requested;
    req.writtenAuthorisationId = authorisation.id;
    return true;
  }
}
