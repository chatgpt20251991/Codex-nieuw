import { GoneException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AccessGrant, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { sha256Hex } from '../../common/crypto/canonical';
import { isCapabilityTier, type CapabilityTier } from '../passports/passport-projection';

type ActiveGrant = AccessGrant & { batteryItemId: string; accessTier: CapabilityTier; validUntil: Date };

@Injectable()
export class AccessTokenService {
  constructor(private readonly prisma: PrismaService, private readonly tenantDb: TenantDbService) {}

  async withGrant<T>(rawToken: string, read: (tx: Prisma.TransactionClient, grant: ActiveGrant) => Promise<T>): Promise<T> {
    if (!rawToken) throw new UnauthorizedException({ code: 'ACCESS_TOKEN_REQUIRED' });
    const hash = sha256Hex(rawToken);
    const rows = await this.prisma.$queryRaw<any[]>`SELECT resolve_access_grant_token(${hash}) AS data`;
    const meta = rows?.[0]?.data;
    if (!meta?.id || !meta?.organisationId) throw new UnauthorizedException({ code: 'INVALID_ACCESS_TOKEN' });
    return this.tenantDb.run(meta.organisationId, async tx => {
      // Validation, disclosure and audit share a transaction. Revocation waits for
      // in-progress reads; reads starting after revocation see the revoked grant.
      await tx.$queryRaw`SELECT id FROM "AccessGrant" WHERE id = ${meta.id} FOR SHARE`;
      const grant = await tx.accessGrant.findFirst({ where: { id: meta.id, organisationId: meta.organisationId, tokenHash: hash } });
      if (!grant) throw new UnauthorizedException({ code: 'INVALID_ACCESS_TOKEN' });
      const now = Date.now();
      if (grant.revokedAt || grant.validFrom.getTime() > now || !grant.validUntil || grant.validUntil.getTime() <= now ||
          !grant.batteryItemId || !isCapabilityTier(grant.accessTier)) {
        throw new GoneException({ code: 'ACCESS_GRANT_INACTIVE' });
      }
      return read(tx, grant as ActiveGrant);
    });
  }
}
