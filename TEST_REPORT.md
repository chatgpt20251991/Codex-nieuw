# EUBatteryPassport V2.1 Test Report

Date: 5 September 2026

## Completed in this environment

### Rule-engine unit tests — 20/20 passed

Coverage includes:
- exactly 71 field definitions and IDs 1..71
- deferred fields excluded from the February-2027 base requirement count
- conditional fields only becoming mandatory through explicit applicability context
- authority-only data point 50 excluded from the public set
- voltage ordering validation
- material mass-fraction >100% blocker
- HTTPS UPI Registry rule
- Registry feature gate
- maximum 100 records per Registry batch
- illegal passport state-transition rejection
- public/restricted access decisions
- delegated Registry action requires verified responsible economic operator
- delegated service provider must be a verified value-chain actor
- delegated Registry action requires active written authorisation
- expired service-provider verification is rejected
- Registry verification cannot remain valid beyond three years from verification

### Static security/compliance verification — 43/43 passed

Verified controls include:
- Prisma models for written authorisations, suppliers, extraction, immutable versions, public snapshots, access grants and lifecycle data
- separate `RegistryIdentity` model for economic-operator and value-chain-actor Registry identities
- `RegistryEnrolmentProfile` for current Commission legal-person enrolment preparation
- forced PostgreSQL RLS policy pack including new Registry profile/identity tables
- separate SECURITY DEFINER public snapshot resolver
- minimal supplier/access token resolvers
- SHA-256 object checksum/content verification path
- immutable passport hash chain
- public projection strips evidence IDs
- no fake live Registry-success path
- OIDC verification and production dev-auth rejection
- written-authorisation cross-tenant gate
- delegated Registry identity gate
- hard three-year Registry-verification ceiling plus electronic-ID-expiry support
- hashed capability tokens
- supplier data starts as `submitted`
- extractor output starts as `suggested`
- conservative Registry feature flags
- no PEM private key or obvious live GitHub/OpenAI token prefix

### Source syntax parse — passed

82 TypeScript/TSX files were parsed with the installed TypeScript parser; 0 files had syntax diagnostics.

### Regulatory re-check — completed

The dated engineering ledger in `docs/15_REGULATORY_STATUS_2026-09-05.md` records:
- EU DPP Registry operational since 20 July 2026
- current battery registration remains unavailable while the battery semantic catalogue is undefined
- Article 5 Registry verification for value-chain actors/service providers
- Article 19(4) third-party verification requirement when acting for an economic operator
- maximum three-year Registry verification lifetime
- current legal-person enrolment fields and QSeal/PAdES preparation details
- six harmonised DPP standards already cited in the OJ
- remaining two standards, battery access-right act and service-provider delegated act remain future/pending items and are not treated as final requirements

## Not completed in this environment

The complete root dependency install is still unavailable in this generation runtime. `node_modules/.bin/prisma` is not present. Therefore the following are deliberately **not** claimed as complete:
- NestJS full typecheck/build
- Next.js full typecheck/build
- Prisma Client generation
- `prisma validate`
- generated database migration for V2.1 models
- live PostgreSQL RLS integration tests
- live MinIO evidence-upload E2E tests
- QSeal/QES cryptographic validation
- live EU DPP Registry test-environment integration

These remain mandatory Codex gates in `codex/NEXT_TASKS.md`.

## Release classification

**Pre-production engineering V2.1 / design-partner build.** Do not deploy for real customer compliance data until every production gate in README and the Codex handoff is green.
