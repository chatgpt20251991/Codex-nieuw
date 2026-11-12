# Customer workspaces — 12 November 2026

The provider console can select the responsible operator represented by a current
written authorisation. Selection requests delegation; it grants no permissions.
The API still checks the authenticated role, exact named action, live grant,
transaction locks and tenant RLS for every protected action. Publication,
evidence and Registry gates are unchanged.

## Discovery and selection

The browser checks its cookie session and reads its own organisation without an
acting header. A missing organisation record permits own-organisation onboarding;
the browser never invents an organisation UUID. The separate own-only
`GET /organisations/authorised-customers` projection supplies customer identity,
current grants, validity and explicit actions. Multiple grants for one customer
are combined for display without implying additional permissions. Malformed,
future, expired or unavailable choices cannot activate a customer workspace.

`WorkspaceProvider` lives above the complete page subtree in the root layout.
Its selected customer, discovery metadata and request epoch remain in memory.
No workspace ID is placed in a cookie, URL, browser storage or `window.name`.
Existing isolated development-token storage is not used to select customers.
Public scan, supplier and restricted-reader portals do not perform this discovery
and keep their separate public/capability access policies.

Switching aborts the previous request context, clears the whole private page
subtree, and navigates to `/dashboard` without a previous dossier query or
fragment before mounting the next workspace. Every private page uses
`useWorkspaceApi()`: its client captures an immutable epoch and tenant. It checks
that binding before starting a request and before returning a response. An old
async continuation cannot start another operation under a newly chosen tenant.
Storage uploads and source-download helpers share that context cancellation.

Authorisation management and organisation bootstrap always use the owner's
workspace. Entering those pages resets the active customer before mounting them.
A customer-bound attempt to call an own-only management endpoint is rejected;
it is never silently replayed against the provider's organisation.

## Cookie identity binding

After the existing SDK identity, MFA and administrator-provisioned claim checks,
the Auth0 callback computes a WebCrypto HMAC-SHA256 over the domain-separated
tuple `eubp.browser-auth-context.v1`, verified subject, organisation and role,
using the existing server session secret. Only the opaque marker is retained
alongside the already selected session profile fields; raw authorisation claims
are still excluded from browser profile responses.

`GET /api/session` returns `identityContext` with its existing authenticated
status and optional display name. This opaque digest is a change detector, not
an authentication credential. Subject, organisation, role and provider tokens
are not added to the JSON response. The marker is held only in browser memory.

Private BFF requests require `x-eubp-identity-context` to match the marker in
their current authenticated encrypted session. Missing or mismatching headers
return `409 AUTH_CONTEXT_CHANGED` before an upstream request. The header is not
forwarded upstream. Browser-supplied bearer credentials and acting/identity
header overrides are discarded by the bound client. The BFF still obtains its
API access token from the SDK and preserves host, Origin, JSON/size and response
bounds. Neither a matching digest nor a customer header bypasses API checks.

Existing SDK cookies without the new marker require a fresh sign-in. Both the
session endpoint and direct private BFF access enforce this migration. MFA and
provisioning assertions are retained; there is no production development-token
exception.

On focus, visibility, page restoration and periodic checks, unchanged identity
and authorisation data preserve open forms. New requests and response delivery
wait for a pending identity check. A changed subject or role within the same
organisation also changes the marker and clears the private view. A cookie
change after that browser check is caught by the BFF header comparison.

## Denial, expiry and sign-out

A denied action is not interpreted as proof that every grant was revoked.
Discovery is rechecked without replaying the action. Remaining unchanged grants
leave other permitted actions available. Changed scopes remount a clean view;
missing grants, unconfirmed access or changed identity pause the private view.
The console does not automatically retry a mutation or fall back to acting on
the provider's own organisation.

The dashboard requests only explicitly permitted read panels. Missing permission
is shown as unavailable, not a fabricated zero count. Navigation reflects the
read actions required by each current console view. The server remains the
authority even when a control is visible or disabled in the browser.

Signing out clears the private view before the logout request. A failure remains
visible in the provider's sign-in fallback, with a retry action; it does not
restore private data automatically. Development authentication remains reachable
only in development and signals same-tab credential changes. Workspace selection
never reads the legacy development acting-organisation value.

Aborting a browser operation cannot recall a transaction or capability already
accepted by the server. Submitted operations may complete in their original
organisation. Inspect audit/current resource state before retrying an uncertain
result.

## Verification and target acceptance

Regression coverage includes discovered membership and scope unions, immutable
request epochs, delayed responses, old continuations after a switch, identity
checks before mutation/response delivery, cookie context pinning and malformed
or legacy session rejection. Exact-revision builds and the required API/browser,
storage, scanner, recovery and security checks must pass before merge. See
`TEST_REPORT.md` and the pull request's current checks for measured results.

This source implementation does not configure or accept a real Auth0 tenant,
MFA enrolment/recovery, EU hosting, storage, monitoring or customer processing
arrangements. Those target-environment checks and Gate 7 remain open. It makes
no standards-conformity or EU registration claim and enables neither live
Registry flag. No paid infrastructure or real customer admission is created.
