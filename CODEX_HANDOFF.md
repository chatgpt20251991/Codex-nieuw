# Codex Handoff — 5 September 2026

## Current engineering status
Gates 1 and 2 are verified locally and in GitHub Actions on `e9ee731`.
Gate 3 was merged through PR #11 at `5546343` after passing GitHub Actions.
Gate 4 adds real MinIO/browser evidence integrity coverage: 34 integration tests
(14 isolation, 8 disclosure, 12 evidence scenarios), with no skips. Read
TEST_REPORT.md and codex/GATE_4_REPORT.md for verification scope and remaining
gates. The original generation notes below are historical.
Gate 4 is merged through PR #12 at `e388103`.

Gate 5 is implemented and verified in PR #13 on
`fix/gate-5-passport-lifecycle`. GitHub Actions run `33988585085` on `a2386e1`
passed clean installation, schema/type checks, 21 rule tests, four canonical JSON
tests, 43 source checks, production builds and all 48 integration scenarios
without skips. A separate old-schema migration upgrade preserved an existing
published version and enforced grants and cascade protection. Read
`codex/GATE_5_REPORT.md` for evidence, API boundaries and rollout requirements.
Local integration startup remained blocked; the actual integration and migration
verification ran in GitHub's isolated PostgreSQL/MinIO/Chromium environment.

Gate 5 is merged through PR #13 at `6972b2e`.

Gate 6 internal Registry preparation is implemented in PR #14 on
`fix/gate-6-registry-contract`. GitHub Actions run `33990468657` on `df8b1a5`
passes clean install, schema/typechecks, 32 unit tests, 43 source checks, production
builds, all 65 integration scenarios and the prior-schema migration-upgrade check.
Read `codex/GATE_6_REPORT.md` and `docs/16_REGISTRY_CONTRACT_2026-09-05.md`.
JSON/XML fixtures are internal drafts, not verified official upload files. Actual
template mapping and external responses still require official assets and real
authenticated Registry tests. Both live flags remain false; the API and health
status also report the absent adapter as unavailable when flags are misconfigured.

PR #14 is merged at 68b15a2. Gate 7 repository security work is verified in
PR #15 on fix/gate-7-production-security: 54 unit tests, 43 source checks,
99 integration scenarios, the upgrade/restore checks, production builds and all
four security scans pass on 293a0f9. Main requires all five CI/security checks.
Read codex/GATE_7_REPORT.md and docs/17 through docs/21 for execution evidence.
Real-provider login, production storage/scanner/WAF, encrypted recovery and
external penetration testing remain required before go-live.
PR #15 is merged at `f164e60`. Auth0 has been selected for browser login, using
an EU tenant when the administrator creates it. The browser-login follow-up
adds the official Next SDK, a server-side API proxy, protected cookie sessions
and an administrator-controlled claim Action. Read `docs/22_AUTH0_SETUP.md`.
The real tenant, application credentials, deployment URLs and MFA acceptance
are still to be supplied and verified. Do not mark Gate 7 closed or advance
to Gate 8 before the documented production acceptance evidence is complete.

PR #16 is merged at `e151ef2`. The merged revision passes 76 unit tests,
43 source checks, all 116 integration scenarios, the upgrade/restore checks,
production builds and all four security scans. Main CI run `33999361812` and
security run `33999361767` record that result. The follow-up database startup
guard checks the actual production connection before the API listens; read
the database acceptance section in `docs/21_PRODUCTION_SECURITY_RUNBOOK.md`.
No Auth0 account, hosting environment or deployment secrets were provisioned.

## Mission
Turn this V2.1 pre-release into a reproducibly deployable design-partner release without weakening its compliance/security truth gates.

## What ChatGPT completed
- 71-point rules package with 20 passing unit tests
- conditional applicability context
- expanded Prisma domain model (29 models)
- OIDC/dev-auth split and global guards
- service-provider cross-tenant written-authorisation gate
- TenantDb RLS transaction helper + SQL policy pack
- evidence direct-upload flow with object-byte SHA-256 verification
- supplier request/token/submission flow
- extraction webhook contract with suggestions-only semantics
- validated-value provenance gate
- immutable passport publishing + SHA-256 version chain
- separate public snapshot storage + SECURITY DEFINER public resolver
- QR/UPI resolver service
- restricted access capability grants
- lifecycle/telemetry endpoints
- Registry pre-validation and anti-fake gate
- explicit RegistryIdentity model separating verified economic operator and verified value-chain actor/service provider
- delegated Registry actor gate requiring active written authorisation and non-expired Registry verification
- RegistryEnrolmentProfile + UI for current legal-person enrolment preparation
- Next.js operator workspace + supplier and restricted portals

## Environment limitation during generation
The current generation environment could not complete external `npm install` within the available command timeout. Therefore:
- the pure TypeScript `@eubp/rules` package was compiled and its 20 tests passed;
- source-level static verification is included;
- Nest/Next/Prisma full dependency compile and migration validation MUST be the first Codex task.

Do not interpret this as a failed architecture. Treat package install / generated Prisma types / framework compile errors as the first engineering pass.

## Regulatory baseline that was re-checked on 5 Sep 2026
- Commission battery page states the Battery Passport requirement begins 18 Feb 2027 for the relevant battery categories.
- Commission news dated 21 Aug 2026 points to the guidance updated 15 Aug 2026 and describes category-by-category mandatory/optional/conditional/not-yet-displayed data points.
- Implementing Decision (EU) 2026/1736 cites EN 18216, EN 18219, EN 18220, EN 18221, EN 18222 and EN 18223.
- Implementing Regulation (EU) 2026/1778 establishes implementation arrangements for the DPP Registry. Article 5 verifies value-chain actors and Article 19(4) requires a third party acting for an economic operator to follow that verification process.
- The current Commission Registry User Guide still says battery DPP registration cannot yet succeed because the battery semantic catalogue is not defined; it also documents HTTPS UPI, JSON/XML file submission and a 100-record batch maximum.
- See `docs/15_REGULATORY_STATUS_2026-09-05.md` for the dated engineering ledger.

Do not infer unpublished standard text from titles. Obtain/review the standards lawfully before implementing exact conformity profiles.

## Highest-priority engineering risks
1. Prisma schema/migrations are verified in Gate 1/2; keep the clean-install CI gate required for changes.
2. RLS isolation is verified with separate migration/runtime DB roles; retain the non-owner role in all future integration tests.
3. OIDC claims mapping must be matched to the chosen identity provider.
4. Gate 4 verifies MinIO checksum/browser transport using an isolated historical fixture. Production storage selection, security, KMS and retention/immutability remain open.
5. ClamAV evidence scanning is implemented in Gate 7; real production storage
   versioning, maintained signatures and scanner deployment evidence remain blockers.
6. Supplier invitation email delivery is not yet wired to a transactional email provider.
7. External authority identity/access must replace capability links for authority-only data.
8. Live Registry adapter remains intentionally disabled.
9. Gate 4 tests suggestions-only extraction against a local webhook; a private, DPA-reviewed production provider and its complete schema contract remain open.
10. Retention/continuity/wind-down mechanics require legal + operational validation before contractual “lifetime” promises.

## Do not do first
- no redesign
- no blockchain
- no marketing copy work
- no fake registry sandbox response
- no removal of security gates to get a green demo
