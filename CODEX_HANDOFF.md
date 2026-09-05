# Codex Handoff — 5 September 2026

## Current engineering status
Gate 1 and Gate 2 are locally verified. Read TEST_REPORT.md and codex/GATE_2_REPORT.md
for exact scope and remaining gates. The original generation notes below are historical.
Next implementation work starts at Gate 3.

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
1. Prisma schema/migration validation has not run against installed Prisma 6 in this environment.
2. RLS policies need integration testing using separate migration/runtime DB roles; table owners can defeat bad RLS testing assumptions.
3. OIDC claims mapping must be matched to the chosen identity provider.
4. MinIO/S3 checksum header behaviour needs an end-to-end browser test.
5. Evidence malware scanning is not yet implemented and is a production launch blocker.
6. Supplier invitation email delivery is not yet wired to a transactional email provider.
7. External authority identity/access must replace capability links for authority-only data.
8. Live Registry adapter remains intentionally disabled.
9. Evidence extraction webhook needs a private, DPA-reviewed provider and schema-contract tests.
10. Retention/continuity/wind-down mechanics require legal + operational validation before contractual “lifetime” promises.

## Do not do first
- no redesign
- no blockchain
- no marketing copy work
- no fake registry sandbox response
- no removal of security gates to get a green demo
