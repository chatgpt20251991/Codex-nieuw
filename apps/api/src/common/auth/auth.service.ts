import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { z } from 'zod';
import type { Actor } from './auth.types';
import { ACTOR_ROLES, boundedInteger, claimName, httpsUrl } from './auth-config';

@Injectable()
export class AuthService {
  private readonly mode: 'dev' | 'oidc';
  private readonly oidcJwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer?: string;
  private readonly audience?: string;
  private readonly organisationClaim: string;
  private readonly roleClaim: string;
  private readonly algorithms: string[];

  constructor(private readonly config: ConfigService) {
    const mode = config.get<string>('AUTH_MODE') || 'dev';
    if (!['dev', 'oidc'].includes(mode)) throw new Error('AUTH_MODE must be dev or oidc.');
    if (config.get('NODE_ENV') === 'production' && mode !== 'oidc') throw new Error('Production requires OIDC authentication.');
    this.mode = mode as 'dev' | 'oidc';
    this.organisationClaim = claimName(config.get('OIDC_ORGANISATION_CLAIM'), 'org_id');
    this.roleClaim = claimName(config.get('OIDC_ROLE_CLAIM'), 'role');
    if (this.organisationClaim === this.roleClaim) throw new Error('OIDC organisation and role mappings must differ.');
    this.algorithms = (config.get<string>('OIDC_ALLOWED_ALGORITHMS') || 'RS256').split(',').map(value => value.trim());
    if (this.algorithms.some(value => !['RS256', 'PS256', 'ES256'].includes(value))) throw new Error('OIDC algorithms must use supported asymmetric signatures.');
    if (this.mode === 'oidc') {
      this.issuer = config.get<string>('OIDC_ISSUER');
      this.audience = config.get<string>('OIDC_AUDIENCE');
      httpsUrl(this.issuer, 'OIDC_ISSUER');
      if (!this.audience || this.audience.trim() !== this.audience) throw new Error('OIDC_AUDIENCE must identify the API resource.');
      const jwksUrl = httpsUrl(config.get<string>('OIDC_JWKS_URL'), 'OIDC_JWKS_URL');
      this.oidcJwks = createRemoteJWKSet(jwksUrl, {
        timeoutDuration: 5000,
        cooldownDuration: boundedInteger(config.get('OIDC_JWKS_COOLDOWN_MS'), 30000, 1000, 300000, 'OIDC_JWKS_COOLDOWN_MS'),
        cacheMaxAge: boundedInteger(config.get('OIDC_JWKS_CACHE_MAX_AGE_MS'), 600000, 1000, 86400000, 'OIDC_JWKS_CACHE_MAX_AGE_MS'),
      });
    }
  }

  async verifyBearer(token: string): Promise<Actor> {
    try {
      if (!token || token.length > 16384) throw new Error('Invalid token size.');
      if (this.mode === 'dev') return await this.verifyDev(token);
      if (!this.oidcJwks) throw new Error('OIDC is not configured.');
      const { payload } = await jwtVerify(token, this.oidcJwks, {
        issuer: this.issuer, audience: this.audience, algorithms: this.algorithms,
        requiredClaims: ['sub', 'exp', 'iat', this.organisationClaim], maxTokenAge: 3600, clockTolerance: 5,
      });
      if (this.organisationClaim === 'org_id' && Object.hasOwn(payload, 'organisation_id') && payload.organisation_id !== payload.org_id) throw new Error('Ambiguous organisation claims.');
      return this.actor(payload, this.organisationClaim, this.roleClaim, 'oidc');
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_ACCESS_TOKEN', message: 'Access token is invalid or incomplete.' });
    }
  }

  async createDevToken(input: { subject: string; organisationId: string; role?: string; email?: string }) {
    if (this.mode !== 'dev' || this.config.get('NODE_ENV') === 'production') throw new UnauthorizedException('Development token issuance is disabled.');
    const claims = { sub: input.subject, org_id: input.organisationId, role: input.role || 'operator_admin', email: input.email };
    this.actor(claims, 'org_id', 'role', 'dev');
    return new SignJWT({ org_id: claims.org_id, role: claims.role, email: claims.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(input.subject)
      .setIssuedAt().setExpirationTime('8h').setIssuer('eubatterypassport-dev')
      .setAudience('eubatterypassport-api').sign(new TextEncoder().encode(this.devSecret()));
  }

  private actor(payload: JWTPayload, organisationClaim: string, roleClaim: string, mode: 'dev' | 'oidc'): Actor {
    const subject = z.string().min(1).max(255).refine(value => value.trim() === value).parse(payload.sub);
    const organisationId = z.string().uuid().parse(payload[organisationClaim]);
    const role = z.enum(ACTOR_ROLES).parse(Object.hasOwn(payload, roleClaim) ? payload[roleClaim] : 'operator_user');
    return { subject, organisationId, role, mode,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      displayName: typeof payload.name === 'string' ? payload.name : undefined };
  }

  private async verifyDev(token: string): Promise<Actor> {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(this.devSecret()), {
      issuer: 'eubatterypassport-dev', audience: 'eubatterypassport-api', algorithms: ['HS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'org_id'], maxTokenAge: 28800, clockTolerance: 5,
    });
    return this.actor(payload, 'org_id', 'role', 'dev');
  }

  private devSecret() {
    const secret = this.config.get<string>('DEV_JWT_SECRET') || '';
    if (secret.length < 32) throw new Error('DEV_JWT_SECRET must be at least 32 characters');
    return secret;
  }
}
