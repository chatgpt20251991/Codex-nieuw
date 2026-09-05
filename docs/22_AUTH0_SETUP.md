# Auth0 EU tenant and browser login setup

Prepared on 6 September 2026 for the pinned `@auth0/nextjs-auth0` 4.29.0 SDK.
This is an administrator runbook and a tested Action template. No Auth0 tenant,
application, subscription, secret or real-user account was created by these files.
Successful local/CI fixtures do not establish real-provider acceptance.

## 1. Select the tenant and administrators

Use a dedicated Auth0 tenant for each environment and choose **Europe (EU)** when
creating it. Record the actual assigned domain; Auth0 assigns the sub-locality,
so do not invent a tenant domain or assume EU-2 can be selected independently.
Restrict tenant administration to named administrators and protect their access
with MFA. Review the applicable data-processing agreement, subprocessors and log
retention before entering customer identities. EU region selection alone does not
constitute a complete privacy review. [Auth0 tenant setup](https://auth0.com/docs/get-started/auth0-overview/create-tenants)

Use the selected tenant domain consistently for authorization, issuer and JWKS.
If a custom domain is introduced later, review issuer configuration and existing
sessions as a migration; do not mix domains in one environment.

## 2. Register the API

Open **Applications → APIs → Create API**. Name it `EUBatteryPassport API` and select
**RS256**. Choose one stable API Identifier and reuse it exactly everywhere below.
`https://api.eubatterypassport.nl` is the proposed identifier; an identifier is not
proof that this URL is deployed. It must differ from the web application's Client
ID and from the Auth0 Management API audience.

Set **Maximum Access Token Lifetime** to **3600 seconds or less**. The repository
checks issuer, audience, asymmetric signature, expiry and a maximum token age of
one hour. Do not retain Auth0's longer default lifetime. Where the dashboard shows
a separate implicit/hybrid lifetime, set that no higher either; this application
uses the authorization-code flow. [Auth0 token lifetime settings](https://auth0.com/docs/secure/tokens/access-tokens/update-access-token-lifetime)

Leave **Allow Offline Access** disabled for the initial release. Do not enable
machine-to-machine access or authorize unrelated applications to this API as part
of browser setup. No refresh token or `offline_access` scope is needed initially.
When the access token expires, the user signs in again. Any later refresh-token
rollout needs rotation, revocation, lifetime and session tests.

## 3. Register the server-rendered web application

Open **Applications → Applications → Create Application**, name it
`EUBatteryPassport Console`, and choose **Regular Web Application**. Use Universal
Login. Enable only the intended identity connection(s) for this application and
disable public signup on a database connection during the design-partner rollout.
Provision accounts through administrators. Configure authorization code as the
login grant; password, implicit and client-credentials grants are unnecessary for
this web application. [Auth0 Next.js setup](https://auth0.com/docs/quickstart/webapp/nextjs)

Register exact URLs, with no wildcards:

| Setting | Local development application | Staging/production application |
|---|---|---|
| Allowed Callback URLs | `http://localhost:3000/auth/callback` | `<https-web-origin>/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000` | `<https-web-origin>` |
| Allowed Web Origins | `http://localhost:3000` | `<https-web-origin>` |

Replace `<https-web-origin>` with the deployed console origin. Do not put localhost
callbacks on the production application. The callback belongs to the Next.js web
server, not the Nest API. Application Client Secret and session-encryption secret
remain on the server and must never use a `NEXT_PUBLIC_` name.

## 4. Provision the tenant and role mapping

Auth0's native Organization identifier looks like `org_…`. It is **not** the
application's PostgreSQL Organisation UUID. The API therefore uses these exact
namespaced claims:

| Token claim | Administrator-controlled user attribute |
|---|---|
| `https://eubatterypassport.nl/organisation_id` | `app_metadata.eubp_organisation_id` |
| `https://eubatterypassport.nl/role` | `app_metadata.eubp_role` |

In **User Management → Users**, an authorized administrator selects the correct
verified identity and updates its **app_metadata**. Copy the existing application's
organisation UUID from the approved onboarding record, in canonical lowercase.
Never create a tenant mapping from an email domain, signup field, request parameter,
native Auth0 `org_id`, display name or `user_metadata`. Auth0 documents app metadata
as access-related data and user metadata as user-editable preferences.
[Auth0 metadata model](https://auth0.com/docs/manage-users/user-accounts/metadata)

The administrator's JSON has this shape; replace the placeholder with the approved
database UUID before saving:

```json
{
  "eubp_organisation_id": "<existing-database-organisation-uuid>",
  "eubp_role": "operator_user"
}
```

Use `operator_user` for ordinary users. The other accepted roles are
`operator_admin`, `compliance_manager`, `service_provider` and
`service_provider_admin`; assign them only under the documented role approval.
There is no automatic administrator role and no default when metadata is missing.
If the application organisation has not yet been provisioned, complete approved
administrator onboarding first; do not reuse a test UUID or bypass the Action.

Record who approved a mapping, its organisation UUID, role, Auth0 user ID and time.
Any provisioning automation must use a separate, restricted Management API client
in a server-only administrative environment. Do not grant metadata-update rights
to the browser application or normal user tokens, and do not build a self-service
form that edits these two attributes. The template deliberately makes no metadata
writes. Ordinary Auth0 Dashboard users must not be able to administer assignments.

When an identity provides email, complete real email verification before granting
access: the Action requires the boolean `email_verified: true`. Do not manually
mark an unverified mailbox as verified. Email-free enterprise identities may use
explicit administrator provisioning; no replacement email is invented. Identity
and tenant membership never depend on matching email addresses.

Changing app metadata controls newly issued tokens. An already issued access token
can remain valid until expiry; a dashboard role edit or browser logout must not be
reported as immediate API token revocation. Define the incident procedure for
existing sessions and tokens before production, with a shorter token lifetime or
additional server-side revocation if immediate removal is required.

## 5. Deploy the Post Login Action

Open **Actions → Library**, create a custom **Login / Post Login** Action named
`EUBP verified tenant claims`, and select a currently supported Node.js runtime.
Copy the complete source from `infra/auth0/post-login-action.cjs`. It needs no npm
dependencies. Set its secret **EUBP_API_AUDIENCE** to the API Identifier from step 2.
This configuration value is not an access token or client secret.

The Action checks `event.resource_server.identifier` before adding claims. Other
API audiences get no EUBP claims. For the selected API, missing/invalid provisioning
or an unverified supplied email denies login before any claims are added. The same
approved tenant and role are added to access and ID tokens; only access tokens are
for the API. Error reasons contain no account or tenant details. A missing audience
secret denies login rather than inventing configuration.
[Post Login event reference](https://auth0.com/docs/actions/reference/post-login/post-login-event-object),
[Post Login API reference](https://auth0.com/docs/actions/reference/post-login/post-login-api-object)

Test the Action using synthetic identities for both approved and denied cases,
then **Deploy** it. In **Actions → Flows → Login**, add the deployed Action and
apply the flow. Review the entire flow: no later Action may overwrite these claims
from untrusted data or grant additional tenant privileges. Record the deployed
Action version and the repository commit used. A saved draft is not an active
control. The eight repository tests run with
`node --test test/unit/auth0-action.test.cjs` and are also included in `npm test`.

## 6. Configure MFA and connection protections

Under **Security → Multi-factor Auth**, enable at least one independent factor and
set the policy to **Always** for the initial protected tenant. Prefer a FIDO security
key where the selected plan supports it; an authenticator-app OTP with recovery
codes is the practical alternative. Verify actual plan entitlements in the tenant;
some factors or adaptive options require a different subscription. Do not treat
an unavailable factor as configured, purchase a plan automatically, or turn MFA
off to pass acceptance. Check the recovery path with a separate test user.
[Auth0 MFA configuration](https://auth0.com/docs/secure/multi-factor-authentication/enable-mfa),
[factor availability](https://auth0.com/docs/secure/multi-factor-authentication/multi-factor-authentication-factors)

Enable the relevant brute-force/bot protections supported by the connection and
plan. MFA recovery and administrator access are operational controls; the claim
Action does not replace them or certify a selected factor.

## 7. Supply server configuration

Use the approved environment/secret store. These files do not write a local `.env`
or produce credentials. The actual assigned Auth0 domain and generated secrets
must be supplied by the administrator/deployment operator.

| Component | Variable | Value/source |
|---|---|---|
| Next.js server | `AUTH0_DOMAIN` | Actual Auth0 tenant domain; no guessed tenant name |
| Next.js server | `AUTH0_CLIENT_ID` | Regular Web Application Client ID |
| Next.js server | `AUTH0_CLIENT_SECRET` | That application's server-only secret |
| Next.js server | `AUTH0_SECRET` | Separate cryptographically random 32-byte session key, encoded as 64 hex characters |
| Next.js server | `APP_BASE_URL` | Exact console origin registered above |
| Next.js server | `AUTH0_AUDIENCE` | Exact API Identifier from step 2 |
| Next.js server | `API_BASE_URL` | Configured HTTPS API base URL including `/v1`; loopback HTTP only for local development |
| Nest API | `AUTH_MODE` | `oidc` |
| Nest API | `OIDC_ISSUER` | Actual tenant HTTPS issuer, including its trailing `/` |
| Nest API | `OIDC_JWKS_URL` | That issuer's `.well-known/jwks.json` URL |
| Nest API | `OIDC_AUDIENCE` | Exact API Identifier from step 2 |
| Nest API | `OIDC_ALLOWED_ALGORITHMS` | `RS256` |
| Nest API | `OIDC_ORGANISATION_CLAIM` | `https://eubatterypassport.nl/organisation_id` |
| Nest API | `OIDC_ROLE_CLAIM` | `https://eubatterypassport.nl/role` |
| Auth0 Action | `EUBP_API_AUDIENCE` | Exact API Identifier from step 2 |

Keep requested login scopes to `openid profile email`. Do not add `offline_access`
or Management API scopes. Follow the repository's cookie/session settings; do not
expose a token endpoint or copy access/refresh tokens into browser storage. Database,
storage, scanner and HTTPS deployment settings remain required separately. Both EU
Registry feature flags remain false.

## 8. Record real-provider acceptance

Perform these checks against the deployed staging console and the actual Auth0
tenant. Retain timestamps, configuration versions and redacted request/Action IDs;
never paste complete tokens, cookies or secrets into issues, screenshots or logs.

- Login completes through Universal Login, MFA and `/auth/callback`; logout removes
  the application session and follows the registered return URL.
- The API accepts an actual RS256 access token with the configured issuer/audience,
  canonical UUID and approved role. An ID token or another API's token is rejected.
- Two separately provisioned organisations see only their own records. A service
  provider still needs a live WrittenAuthorisation for acting-on-behalf access.
- Missing metadata, native `org_…`, invalid UUID, unknown/missing role, and supplied
  unverified email all deny access. Changing user metadata cannot change tenant or
  role. An ordinary user cannot edit app metadata through the Dashboard or an API.
- Authorization requests for another audience receive no EUBP claims. Unbound or
  disabled Actions cannot yield a valid application session with missing claims.
- Session cookies are Secure/HttpOnly as deployed, expired credentials require
  login again, and browser storage/network responses expose no bearer or refresh
  token. Cross-origin mutations, forged acting-organisation headers, callback
  tampering and open-redirect attempts fail.
- Record MFA enrollment/recovery and the effect of blocking/removing a user on
  future logins versus existing tokens. Confirm the documented revocation window.
- Record the actual tenant region, domain, application/API IDs, Action version,
  token lifetimes, enabled factors and reviewed privacy/retention settings.

Only those real observations close the provider acceptance item. Storage/scanner
operations, encrypted recovery, WAF and external penetration testing remain the
separate Gate 7 launch requirements listed in `codex/GATE_7_REPORT.md`.
