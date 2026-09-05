import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import type { Actor } from './auth.types';

@Injectable()
export class AuthService {
  private readonly mode: 'dev' | 'oidc';
  private readonly oidcJwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {
    this.mode = (this.config.get('AUTH_MODE') || 'dev') as 'dev' | 'oidc';
    if (this.mode === 'oidc') {
      const jwksUrl = this.config.get<string>('OIDC_JWKS_URL');
      if (!jwksUrl) throw new Error('OIDC_JWKS_URL is required when AUTH_MODE=oidc');
      this.oidcJwks = createRemoteJWKSet(new URL(jwksUrl));
    }
  }

  async verifyBearer(token: string): Promise<Actor> {
    try {
      if (this.mode === 'dev') return await this.verifyDev(token);
      const issuer = this.config.get<string>('OIDC_ISSUER');
      const audience = this.config.get<string>('OIDC_AUDIENCE');
      if (!issuer || !audience || !this.oidcJwks) throw new Error('OIDC is not fully configured');
      const { payload } = await jwtVerify(token, this.oidcJwks, { issuer, audience });
      const organisationId = String(payload.org_id || payload.organisation_id || '');
      const role = String(payload.role || 'operator_user');
      if (!payload.sub || !organisationId) throw new Error('Token must contain sub and org_id claims');
      return {
        subject: String(payload.sub),
        organisationId,
        role,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        displayName: typeof payload.name === 'string' ? payload.name : undefined,
        mode: 'oidc',
      };
    } catch (error) {
      throw new UnauthorizedException({ code: 'INVALID_ACCESS_TOKEN', message: 'Access token is invalid or incomplete.' });
    }
  }

  async createDevToken(input: { subject: string; organisationId: string; role?: string; email?: string }) {
    if (this.mode !== 'dev' || this.config.get('NODE_ENV') === 'production') {
      throw new UnauthorizedException('Development token issuance is disabled.');
    }
    const secret = new TextEncoder().encode(this.devSecret());
    return new SignJWT({ org_id: input.organisationId, role: input.role || 'operator_admin', email: input.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.subject)
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('eubatterypassport-dev')
      .setAudience('eubatterypassport-api')
      .sign(secret);
  }

  private async verifyDev(token: string): Promise<Actor> {
    const secret = new TextEncoder().encode(this.devSecret());
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'eubatterypassport-dev',
      audience: 'eubatterypassport-api',
    });
    const organisationId = String(payload.org_id || '');
    if (!payload.sub || !organisationId) throw new Error('Missing dev claims');
    return {
      subject: String(payload.sub),
      organisationId,
      role: String(payload.role || 'operator_user'),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      mode: 'dev',
    };
  }

  private devSecret() {
    const secret = this.config.get<string>('DEV_JWT_SECRET') || '';
    if (secret.length < 32) throw new Error('DEV_JWT_SECRET must be at least 32 characters');
    return secret;
  }
}
