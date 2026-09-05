import { httpsUrl } from '../auth/auth-config';

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if (env.AUTH_MODE !== 'oidc') throw new Error('Production requires AUTH_MODE=oidc.');
  httpsUrl(env.RESOLVER_BASE_URL, 'RESOLVER_BASE_URL');
  httpsUrl(env.SUPPLIER_PORTAL_BASE_URL, 'SUPPLIER_PORTAL_BASE_URL');
  httpsUrl(env.RESTRICTED_ACCESS_BASE_URL, 'RESTRICTED_ACCESS_BASE_URL');
  httpsUrl(env.OIDC_ISSUER, 'OIDC_ISSUER');
  httpsUrl(env.OIDC_JWKS_URL, 'OIDC_JWKS_URL');
  if (!env.OIDC_AUDIENCE?.trim()) throw new Error('Production OIDC audience is required.');
  if (!env.WEB_ORIGIN) throw new Error('Production WEB_ORIGIN is required.');
  for (const origin of env.WEB_ORIGIN.split(',').map(value => value.trim())) {
    if (httpsUrl(origin, 'WEB_ORIGIN').origin !== origin) throw new Error('WEB_ORIGIN must contain exact HTTPS origins.');
  }
  if (env.MALWARE_SCANNER !== 'clamav' || !env.CLAMAV_HOST?.trim()) throw new Error('Production requires configured ClamAV scanning.');
}
