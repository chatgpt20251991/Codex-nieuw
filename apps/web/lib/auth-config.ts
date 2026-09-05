export type BrowserAuthConfig = Readonly<{
  domain: string;
  appBaseUrl: string;
  clientId: string;
  clientSecret: string;
  secret: string;
  audience: string;
  secure: boolean;
}>;

export const AUTH_SCOPE = 'openid profile email';
export const AUTH_SESSION_SECONDS = 3600;
export const AUTH_TRANSACTION_SECONDS = 600;
export const ORGANISATION_CLAIM = 'https://eubatterypassport.nl/organisation_id';
export const ROLE_CLAIM = 'https://eubatterypassport.nl/role';
const applicationRoles = new Set(['operator_user', 'operator_admin', 'compliance_manager', 'service_provider', 'service_provider_admin']);

/** An authenticated identity still needs explicit administrator-provisioned application access. */
export function assertProvisionedIdentity(user: Record<string, unknown>) {
  const organisation = Object.hasOwn(user, ORGANISATION_CLAIM) ? user[ORGANISATION_CLAIM] : undefined;
  const role = Object.hasOwn(user, ROLE_CLAIM) ? user[ROLE_CLAIM] : undefined;
  if (typeof organisation !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(organisation)
    || typeof role !== 'string' || !applicationRoles.has(role)) {
    throw new Error('Application access is not provisioned.');
  }
  if (Object.hasOwn(user, 'email') && (typeof user.email !== 'string' || !user.email.trim()
    || user.email !== user.email.trim() || user.email_verified !== true)) {
    throw new Error('A verified email is required.');
  }
}

/** Return no client until all deployment settings form a coherent configuration. */
export function readAuth0Config(env: NodeJS.ProcessEnv = process.env): BrowserAuthConfig | null {
  const required = ['AUTH0_DOMAIN', 'APP_BASE_URL', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'AUTH0_AUDIENCE'] as const;
  if (required.some(name => !env[name] || env[name]!.trim() !== env[name])) return null;
  try {
    const domain = new URL(env.AUTH0_DOMAIN!.includes('://') ? env.AUTH0_DOMAIN! : `https://${env.AUTH0_DOMAIN}`);
    const app = new URL(env.APP_BASE_URL!);
    if (domain.protocol !== 'https:' || domain.username || domain.password || domain.port || domain.pathname !== '/' || domain.search || domain.hash) return null;
    // Auth0 SDK custom domains are DNS hostnames on HTTPS/443. Its constructor
    // rejects IP, localhost and mDNS names even for a correctly trusted certificate.
    if (domain.hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(domain.hostname)
      || domain.hostname === 'localhost' || domain.hostname.startsWith('localhost.')
      || domain.hostname.endsWith('.localhost') || domain.hostname.endsWith('.local')) return null;
    if (app.username || app.password || app.pathname !== '/' || app.search || app.hash) return null;
    const localDevelopment = env.NODE_ENV === 'development' && app.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname);
    if (app.protocol !== 'https:' && !localDevelopment) return null;
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(env.AUTH0_CLIENT_ID!)) return null;
    if (env.AUTH0_CLIENT_SECRET!.length < 32 || env.AUTH0_CLIENT_SECRET!.length > 4096) return null;
    if (!/^[a-fA-F0-9]{64}$/.test(env.AUTH0_SECRET!)) return null;
    const audience = env.AUTH0_AUDIENCE!;
    if (audience.length > 1024 || /\s/.test(audience)) return null;
    if (env.OIDC_AUDIENCE && env.OIDC_AUDIENCE !== audience) return null;
    if (env.OIDC_ISSUER && env.OIDC_ISSUER !== domain.origin + '/') return null;
    return Object.freeze({ domain: domain.host, appBaseUrl: app.origin, clientId: env.AUTH0_CLIENT_ID!,
      clientSecret: env.AUTH0_CLIENT_SECRET!, secret: env.AUTH0_SECRET!, audience, secure: app.protocol === 'https:' });
  } catch { return null; }
}

export function hasTrustedRequestHost(headers: Headers, appBaseUrl: string) {
  // The deployment origin is configured, never inferred from forwarded headers.
  return headers.get('host')?.toLowerCase() === new URL(appBaseUrl).host.toLowerCase();
}

export function hasSameOrigin(headers: Headers, appBaseUrl: string) {
  return headers.get('origin') === appBaseUrl && hasTrustedRequestHost(headers, appBaseUrl);
}
