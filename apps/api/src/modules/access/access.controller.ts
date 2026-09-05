import { Body, ConflictException, Controller, Headers, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Public } from '../../common/auth/public.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { secureToken, sha256Hex } from '../../common/crypto/canonical';
import { projectPassport } from '../passports/passport-projection';
import { AccessTokenService } from './access-token.service';

const GrantSchema = z.object({
  batteryItemId: z.string().uuid(), granteeSubject: z.string().min(1), granteeRole: z.string().min(1),
  accessTier: z.enum(['legitimate_interest_model', 'legitimate_interest_item']),
  purpose: z.string().min(3).max(1000), validForHours: z.number().int().min(1).max(24 * 90).default(24),
});

@Controller()
export class AccessController {
  constructor(private readonly tenantDb: TenantDbService, private readonly config: ConfigService,
    private readonly tokens: AccessTokenService) {}

  @Post('access-grants')
  async create(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = GrantSchema.parse(body), raw = secureToken();
    const validFrom = new Date(), validUntil = new Date(Date.now() + b.validForHours * 3600000);
    const row = await this.tenantDb.run(orgId, async tx => {
      await tx.batteryItem.findFirstOrThrow({ where: { id: b.batteryItemId, organisationId: orgId } });
      const grant = await tx.accessGrant.create({ data: { organisationId: orgId, batteryItemId: b.batteryItemId,
        granteeSubject: b.granteeSubject, tokenHash: sha256Hex(raw), granteeRole: b.granteeRole,
        accessTier: b.accessTier, purpose: b.purpose, validFrom, validUntil, grantedBySubject: actor.subject } });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'access_grant.create', resourceType: 'access_grant', resourceId: grant.id,
        metadata: { tier: b.accessTier, purpose: b.purpose } } });
      return grant;
    });
    const base = this.config.get<string>('RESTRICTED_ACCESS_BASE_URL') || 'http://localhost:3000/access';
    return { grant: { ...row, tokenHash: undefined }, accessUrl: `${base}#token=${encodeURIComponent(raw)}`,
      securityNotice: 'Capability token is shown once. Authority-only data is deliberately excluded from this token mechanism.' };
  }

  @Post('access-grants/:id/revoke')
  async revoke(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.tenantDb.run(orgId, async tx => {
      await tx.$queryRaw`SELECT id FROM "AccessGrant" WHERE id = ${id} FOR UPDATE`;
      const grant = await tx.accessGrant.findFirstOrThrow({ where: { id, organisationId: orgId } });
      if (grant.revokedAt) return { id: grant.id, revokedAt: grant.revokedAt };
      const row = await tx.accessGrant.update({ where: { id }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'access_grant.revoke', resourceType: 'access_grant', resourceId: id, metadata: { tier: grant.accessTier } } });
      return { id: row.id, revokedAt: row.revokedAt };
    });
  }

  @Public() @Post('restricted-access/session')
  async session(@Headers('x-passport-access-token') token: string) {
    return this.tokens.withGrant(token, async (tx, grant) => {
      const snapshot = await tx.passportVersion.findFirst({ where: { organisationId: grant.organisationId,
        batteryItemId: grant.batteryItemId, publicationState: 'published' }, orderBy: { versionNo: 'desc' } });
      if (!snapshot) throw new ConflictException({ code: 'NO_PUBLISHED_PASSPORT' });
      const output = { ...projectPassport(snapshot.canonicalJson, grant.accessTier),
        access: { tier: grant.accessTier, purpose: grant.purpose, expiresAt: grant.validUntil } };
      await tx.auditEvent.create({ data: { organisationId: grant.organisationId, actorSubject: `grant:${grant.granteeSubject}`,
        action: 'passport.restricted_read', resourceType: 'passport_version', resourceId: snapshot.id,
        metadata: { tier: grant.accessTier, purpose: grant.purpose } } });
      return output;
    });
  }
}
