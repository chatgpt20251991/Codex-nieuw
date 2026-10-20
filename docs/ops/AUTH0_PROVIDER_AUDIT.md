# Read-only Auth0 provider configuration audit

Prepared 17 October 2026. This complements the real-provider procedure in
[the Auth0 runbook](../22_AUTH0_SETUP.md). It does not replace login, MFA,
enrolment, recovery, organisation isolation or production acceptance.

`scripts/ops/auth0-provider-audit.cjs` inspects existing provider configuration
using six Management API GET requests. It never creates or changes an account,
client, Action, token, subscription, grant, factor or callback. No provider
payload, token, client identifier, tenant domain or error message is written into
its report. The only code hash is the expected repository Action SHA-256, with
CRLF/LF and the final newline normalized.

## Prerequisites and execution

An administrator supplies an existing short-lived Management API token through
the authorized process/secret-store environment. Do not pass it in an argument,
commit it, paste it into a chat or store it in an audit report. The auditor does
not obtain credentials or create a Management API application. Use only the read
permissions needed for the documented GET endpoints; never give these permissions
to the console or a customer's browser session.

| Runtime variable | Required value |
| --- | --- |
| `AUTH0_AUDIT_DOMAIN` | Explicit native EU tenant hostname, e.g. `tenant.eu.auth0.com` or `tenant.eu2.auth0.com`; no scheme, slash or port |
| `AUTH0_AUDIT_MANAGEMENT_TOKEN` | Existing administrator-authorized Management API bearer token; server/runtime only |
| `AUTH0_AUDIT_CLIENT_ID` | Actual console application Client ID |
| `AUTH0_AUDIT_RESOURCE_SERVER_ID` | Auth0 resource-server ID, not its audience URL |
| `AUTH0_AUDIT_ACTION_ID` | Actual existing Post Login Action UUID |
| `APP_BASE_URL` | Exact deployed HTTPS console origin, without trailing slash |
| `AUTH0_AUDIT_AUDIENCE` | Exact existing API identifier expressed as an HTTPS origin, without trailing slash |

The initial profile intentionally accepts only native Auth0 EU/EU2 tenant
destinations. Custom domains or other regions need explicit separate review;
changing a URL to an arbitrary host must never send a management token there.
An EU hostname by itself does not establish a complete residency or privacy review.

Run from the repository with Node.js 22.12 or later:

```text
node scripts/ops/auth0-provider-audit.cjs
node --test test/unit/auth0-provider-audit.test.cjs
```

No output file is created automatically. When retaining a real report on the
owner's Windows PC, direct output to an appropriate subfolder under
`E:\Data\Han23\Codex\EUBatteryPassport\outputs\production-controls-2026-10-17`.
Never retain bearer tokens, cookies, raw provider responses or recovery codes there.

## Observed controls and fail-closed behaviour

The audit compares the configured console with the SDK's current
`client_secret_post` exchange, a regular OIDC web client, authorization-code-only
grants, RS256 ID-token signing and exact single callback/logout/web origins. The
client request explicitly excludes `client_secret` from its fields projection.
It checks the intended API's identifier, RS256 algorithm, no offline access and
access-token lifetimes no greater than one hour.

The deployed Action must match the complete repository Action, run on the
reviewed `node22` profile, have no additional dependencies, have the audience
secret name present and be deployed with no pending changes. The Post Login
flow must contain exactly that one deployed version. An Action draft, a stale
deployment, another binding or a later unreviewed Action fails the audit. The
secret's *value* is not returned by Auth0 and remains a real acceptance item.

MFA checks require an enabled independent factor that is not reported as trial
expired, and the `all-applications` policy. The provider's optional `trial_expired`
field may be absent; when present it must be the Boolean `false`. Malformed
markers, including strings or null, cannot pass the configuration check.
Email, platform biometrics and recovery
codes alone cannot satisfy the independent-factor check. Actual ongoing plan
entitlement, factor usability and recovery remain outside this configuration check.

Every request uses HTTPS to the one administrator-configured native EU host,
fixed GET paths, a ten-second deadline, a 512 KiB bound, valid UTF-8 JSON and no
redirects. Missing configuration prevents all requests. Missing permission, errors,
unknown shapes or transport failure fail the relevant check, with no raw exception
or payload in output. The process exits nonzero if a configuration check fails.

Even a fully passing configuration report always records:

```json
{
  "realProviderAcceptancePassed": false,
  "customerLaunchApproved": false,
  "registryRegistrationVerified": false
}
```

The report lists the remaining real observations: plan/privacy/region and admin
review; Action secret value and full-flow review; connection signup, attack
protection and client grants; real HTTPS login, enrolment, challenge cancellation
and recovery; actual tokens and two tenants; cookie/logout/expiry and the
documented existing-token revocation window. Synthetic tests never fill these in.

## Primary references checked 17 October 2026

- [Auth0 client GET/projection](https://auth0.com/docs/api/management/v2/clients/get-clients-by-id)
- [Auth0 resource-server GET](https://auth0.com/docs/api/management/v2/resource-servers/get-resource-servers-by-id)
- [Auth0 Action/deployed version GET](https://auth0.com/docs/api/management/v2/actions/get-action)
- [Auth0 ordered Post Login bindings](https://auth0.com/docs/api/management/v2/actions/get-bindings)
- [Auth0 factors GET and expired-trial field](https://auth0.com/docs/api/management/v2/guardian/get-factors)
- [Auth0 MFA policy GET](https://auth0.com/docs/api/management/v2/guardian/get-policies)
- [Auth0 independent factors and Always policy](https://auth0.com/docs/secure/multi-factor-authentication/enable-mfa)
- [Auth0 subscription-dependent factor availability](https://auth0.com/docs/secure/multi-factor-authentication/multi-factor-authentication-factors)
