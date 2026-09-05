import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantDbService } from './tenant-db.service';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';

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

    const now = new Date();
    const authorisation = await this.tenantDb.run(actor.organisationId, tx => tx.writtenAuthorisation.findFirst({
      where: {
        responsibleOperatorId: requested,
        serviceProviderId: actor.organisationId,
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
    }));
    if (!authorisation) {
      throw new ForbiddenException({ code: 'NO_WRITTEN_AUTHORISATION', message: 'No active written authorisation exists for the requested organisation.' });
    }
    req.tenantOrganisationId = requested;
    req.writtenAuthorisationId = authorisation.id;
    return true;
  }
}
