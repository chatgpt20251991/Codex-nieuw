import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import { AUTH_SCOPE, AUTH_SESSION_SECONDS, AUTH_TRANSACTION_SECONDS, assertProvisionedIdentity, readAuth0Config } from './auth-config';

let client: Auth0Client | undefined;

/** Lazy construction lets builds and the configuration screen work without secrets. */
export function getAuth0Client(): Auth0Client | null {
  const config = readAuth0Config();
  if (!config) return null;
  if (client) return client;
  client = new Auth0Client({
    domain: config.domain,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    secret: config.secret,
    appBaseUrl: config.appBaseUrl,
    authorizationParameters: { scope: AUTH_SCOPE, audience: config.audience },
    signInReturnToPath: '/dashboard',
    enableAccessTokenEndpoint: false,
    enableConnectAccountEndpoint: false,
    enableParallelTransactions: false,
    enableTelemetry: false,
    allowInsecureRequests: false,
    httpTimeout: 5000,
    logoutStrategy: 'oidc',
    includeIdTokenHintInOIDCLogoutUrl: false,
    session: {
      rolling: false,
      absoluteDuration: AUTH_SESSION_SECONDS,
      inactivityDuration: AUTH_SESSION_SECONDS,
      cookie: { name: config.secure ? '__Host-eubp_session' : 'eubp_dev_session',
        secure: config.secure, sameSite: 'lax', path: '/', domain: '', transient: false },
    },
    transactionCookie: { prefix: config.secure ? '__Host-eubp_txn_' : 'eubp_dev_txn_',
      secure: config.secure, sameSite: 'lax', path: '/', domain: '', maxAge: AUTH_TRANSACTION_SECONDS },
    async onCallback(error) {
      if (error) return new NextResponse('Sign-in failed. Please try again.', { status: 400 });
      return NextResponse.redirect(new URL('/dashboard', config.appBaseUrl), 303);
    },
    async beforeSessionSaved(session) {
      assertProvisionedIdentity(session.user);
      // API access tokens remain encrypted inside the HttpOnly cookie. Browser
      // profile responses never need provider/custom authorization claims.
      const { sub, name, email, email_verified } = session.user;
      session.user = { sub,
        ...(typeof name === 'string' ? { name: name.slice(0, 255) } : {}),
        ...(typeof email === 'string' && email_verified === true ? { email: email.slice(0, 320), email_verified: true } : {}) };
      delete session.tokenSet.refreshToken;
      return session;
    },
  });
  return client;
}
