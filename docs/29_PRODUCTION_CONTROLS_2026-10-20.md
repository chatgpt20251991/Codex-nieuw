# Production controls and remaining acceptance — 20 October 2026

This release implements repository controls. It does not approve a live customer
environment, norm conformity, complete provider exit or EU registration. Both
Registry flags remain false. No real customer records, paid infrastructure,
identity accounts, provider credentials or mail deliveries are created here.

## Implemented controls

- [Delegated action scopes](DELEGATED_ACTION_SCOPES.md): strict named Boolean
  permissions on authenticated routes; own-tenant authorisation administration;
  fail-closed unannotated routes; request-isolated delegation; exact grant/scope
  recheck and audit under a shared row lock in each customer transaction.
- [Private operator export](28_OPERATOR_EXPORT_AND_OFFLINE_VERIFICATION.md):
  bounded complete published version history for one battery, unchanged hashes
  and chain, selected current source metadata and an issuance audit. The console
  requires an explicit confidential-download acknowledgement and binds the file
  to the opened battery. The operator can preserve the issuance hash separately.
- Dependency-free offline manifest/chain/source verification and portable archive
  assembly. Missing or changed sources fail verification. POSIX directories and
  files use private modes; CLI errors do not echo private JSON or paths.
- [Read-only Auth0 audit](ops/AUTH0_PROVIDER_AUDIT.md): existing explicitly
  authorised runtime credentials only, fixed EU destinations and GET paths,
  bounded responses, deployed Action hash/binding, client/API and MFA configuration
  checks. It never creates credentials or claims real login acceptance.

## Rollout and boundaries

Existing broad or malformed written grants are not migrated into permissions.
The responsible operator must review the written mandate and explicitly reissue
the required action scopes before delegating work. A read scope does not imply
write, review, publication, private export or source-download access.

Revocation serializes against each authorised database transaction. It does not
recall completed operations, running downloads or already issued capabilities.
A multi-transaction HTTP handler can report a later error after an earlier
authorised transaction committed; its atomic scoped audit remains. Review that
audit and resource state before retrying. This release does not claim whole-HTTP
atomicity or immediate invalidation of existing OIDC tokens.

The JSON export contains private published canonical values from all access
tiers, not source bytes. Independent archive assembly requires separately
collected exact source files. Neither proves historic source status at original
publication, authenticity from an unanchored self-contained hash, complete
customer migration, domain/resolver transfer or successor-service restoration.
Those omissions remain explicit even after all included bytes verify.

## Target-environment observations

Read-only Render discovery on 20 October in the previously confirmed workspace
found no EUBatteryPassport service or database. Existing services belong to other
projects and do not establish this platform's readiness. No resource was created
or repurposed. The proposed Frankfurt Blueprint remains unapplied.

HTTPS probes to `app.eubatterypassport.nl` and the API health route from this PC
failed with connection-refused errors on 20 October. DNS existence is not
successful deployment or HTTPS acceptance. No live Auth0 Management API audit
ran without an explicitly supplied audit configuration. Browser control ended
on 17 October because the helper could not confidently establish the current
URL. On 20 October a fresh Chrome connection reached the Auth0 login page and
was left for the owner to sign in. No authenticated dashboard state or MFA
configuration is inferred from either attempt.

Paid hosting remains deferred under the owner's existing instruction unless an
explicit spending decision replaces it. The 17 October low-cost EU VPS comparison
is preparation only: sizing, TLS, private object storage, independent backups,
monitoring and actual MFA entitlement all belong in the final decision. An
expiring or sleeping free instance does not pass long-term customer acceptance.

## Required real acceptance before customer admission

1. Confirm the target and exact recurring/upfront charges, then provision only
   the approved EU compute, certificate-verified database and private storage.
2. Configure the real Auth0 application/callbacks and reviewed Action; run the
   read-only auditor with authorised credentials. Prove actual MFA enrolment,
   challenge cancellation, recovery, logout and two-tenant roles.
3. Prove storage versioning, byte integrity, private access, scanner signatures,
   clean/EICAR/timeout behaviour and gateway/shared rate limits in that target.
4. Deliver alerts, restore encrypted database/object backups independently,
   measure RPO/RTO, close blocking independent security findings and accept
   customer authorisation, processing, retention and continuity arrangements.
5. Review the full lawfully accessed identifier/data-carrier/security standard
   clauses, implement exact profiles and record actual conformance tests. A
   standard's catalogue title or preview is insufficient.
6. Execute an authorised complete customer-exit and stable-URL/successor drill,
   including the records/configuration the current portable export excludes.

The Commission's public timeline rechecked on 20 October labels the remaining
two standard references for November 2026 and restricted battery access rules
for Q4 2026; these are indicative plans, not enacted changes. The FAQ distinguishes
passport creation/hosting from registration. Its linked Registry guide remains
v1.03 (16 September), with battery registration described as unavailable on pages
48/54 for missing semantic content. No authenticated live registration was tested.

- [Commission DPP timeline](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en)
- [Commission battery FAQ](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/eu-digital-product-passport-faq-batteries_en)
- [Linked Registry guide](https://single-market-economy.ec.europa.eu/document/download/079a45e2-469f-4eec-b1e5-32e8e05d1357_en?filename=dpp_registry_user_guide_for_economic_operators.pdf)

## Validation and local storage

Local validation uses a separate source snapshot, dependency installation and
supported build/cache directories on
`E:\Data\Han23\Codex\EUBatteryPassport\validation\production-controls-2026-10-17`.
The existing C: checkout remains the editable source. No existing project was
moved, deleted or replaced with a junction, and CODEX_HOME was not changed.
The operating system and desktop app may still maintain their own C: files.

CI must retain real PostgreSQL, storage, scanner, browser, migration, recovery,
dependency, secret and code-security checks. Synthetic tests never fill in real
provider/customer/Registry acceptance. See TEST_REPORT.md and the pull request's
exact-revision CI results before merging or deploying.
