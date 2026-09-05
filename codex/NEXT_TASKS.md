# Codex execution queue

Work top-to-bottom. Commit after each green gate.

Gates 1 and 2 are verified locally and in GitHub Actions; see their gate reports.
Gate 3 disclosure fixes and regression evidence are recorded in GATE_3_REPORT.md;
PR #11 is merged. Gate 4 evidence integrity and its 12 additional real
MinIO/browser/API scenarios are recorded in GATE_4_REPORT.md.
The next feature/integration work after these gates is Gate 5.

## Gate 1 — Reproducible install/build
- `npm install`
- commit generated `package-lock.json`
- `npm run db:generate`
- `npx prisma validate --schema apps/api/prisma/schema.prisma`
- fix schema relation/type issues, if any
- `npm run typecheck`
- `npm run build`
- `npm test`

## Gate 2 — Database migrations + tenant isolation
- generate initial Prisma migration
- create separate `eubp_migrator` and `eubp_runtime` roles in integration Docker
- runtime role MUST NOT own tables and MUST NOT have BYPASSRLS
- apply `infra/postgres/001_rls.sql` after schema migration
- write integration tests proving Org A cannot read/write Org B through direct API routes
- prove service-provider Org S can act for Org A only with active WrittenAuthorisation
- prove revoked/expired authorisation fails immediately

## Gate 3 — Public/restricted leakage tests
- publish passport containing fields 45–50 and 51+
- prove public resolver contains only public tier
- prove field 50 never reaches public or legitimate-interest capability views
- prove restricted capability token reveals only the granted tier + public fields
- prove expired/revoked token fails

## Gate 4 — Evidence integrity E2E
- use MinIO
- browser/API upload signed PUT
- corrupt file/checksum cases must fail finalisation
- verify evidence
- link evidence to mandatory value
- only then allow value validation
- extraction claim stays `suggested` and can never make readiness “verified” by itself

## Gate 5 — End-to-end passport lifecycle
Local implementation and 14 new scenarios are prepared; see GATE_5_REPORT.md.
Integration execution is blocked by this session's test-service permissions.
Finish verification and review before marking this gate green or starting Gate 6.

- create org → model → item
- fill mandatory values with verified evidence
- validate → ready → publish
- verify immutable v1 hashes
- change value → state updated → publish v2
- verify v2.previousVersionHash === v1.sha256
- repurpose/remanufacture requires prior-passport link
- recycle closes active lifecycle path

## Gate 6 — Registry adapter contract
- keep live submit disabled
- create JSON/XML adapter contract fixtures from current official Registry documentation
- test max-100 batching and reject whole batch locally if any item fails pre-validation
- add correlation/result persistence
- do not enable `registered` transition until a real successful Registry integration test exists

## Gate 7 — Production launch blockers
- OIDC provider integration tests
- malware scan pipeline
- rate limiting/WAF deployment config
- backup + restore drill
- SBOM/SCA + secret scan
- SAST
- dependency pin/lock
- security headers/CSP review
- observability/alerting
- penetration test checklist

## Gate 8 — Registry organisation verification integration
- run Prisma migration for `RegistryIdentity` and `RegistryEnrolmentProfile`
- implement admin-only ingestion of a successful external Registry verification result; ordinary users MUST NOT self-set `verified`
- store external Registry actor identifier and verification evidence/hash
- calculate effective validity as earliest of electronic-ID expiry, explicit Registry validity and 3 years from verification
- integration-test direct economic-operator and delegated service-provider flows
- delegated path must require service provider as verified `value_chain_actor` + active WrittenAuthorisation
- add QSeal certificate inspection helper for legal-person PDF flow; compare OID 2.5.4.10, 2.5.4.6 and 2.5.4.97 to enrolment profile
- do not implement qualified-signature validation from scratch; use a vetted EU/eIDAS-compatible validation service/library and retain evidence
