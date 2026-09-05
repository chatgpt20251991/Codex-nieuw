# CODEX MASTER BUILD PROMPT — EUBatteryPassport.nl V1

You are building a production-minded multi-tenant SaaS for EU Battery Digital Product Passports.

Read these files first and treat them as project authority:
- 01_MASTER_BLUEPRINT.md
- 02_71_DATA_POINTS.json
- 03_DATABASE_SCHEMA.sql
- 04_OPENAPI_DRAFT.yaml
- 05_COMPLIANCE_ENGINE.md
- 06_REGISTRY_INTEGRATION.md
- 07_SECURITY_AND_CONTINUITY.md

## First milestone
Build a fully working local V1 that supports:
1. Organisation creation
2. Battery model creation
3. EV/LMT/industrial category selection
4. Render all 71 field definitions dynamically from JSON/config, never hard-code them in UI
5. Readiness score based on applicability as of 18 Feb 2027
6. Add/edit values with units and provenance
7. Upload/link evidence
8. List blockers/warnings/deferred fields separately
9. Create multiple battery items under one model
10. Generate an internal UPI placeholder and QR only in "development" mode
11. Generate immutable passport version JSON
12. Public endpoint exposes PUBLIC fields only
13. Restricted endpoint enforces role/access tier
14. Registry adapter interface with a mocked adapter and JSON batch exporter
15. Audit log for every mutation

## Stack
- TypeScript
- Next.js
- NestJS
- PostgreSQL
- Prisma or TypeORM
- Zod for runtime schemas
- Docker Compose for local environment
- Vitest/Jest + Playwright
- no blockchain dependency
- no vendor-specific DPP lock-in

## Tests required
- field applicability for each category
- deferred fields not counted as missing for Feb 2027 readiness
- public endpoint leakage test
- authority-only leakage test
- duplicate UPI rejection
- min/nominal/max voltage consistency
- immutable passport version test
- new version generated after change
- registry submission blocked on compliance blockers
- registry batch max 100
- batch prevalidation rejects bad item before export
- lifecycle link test for repurposed battery
- recycled state prevents active updates except archival actions
- every validated value must have provenance

## UI
Design it like enterprise compliance SaaS, not a generic template.
Primary dashboard:
- Readiness %
- Blocking issues
- Evidence coverage %
- Number of items/passports
- Registry state
- Future legal requirements
Each field row:
- requirement status
- value
- unit
- source/evidence
- access level
- last updated
- validation state

## Safety/accuracy
Never display "EU compliant", "EU registered", "certified", or equivalent unless the state machine and evidence support that exact claim.
For the current build, Registry battery submission is unavailable and must be shown as "EU Registry battery submission pending EU semantic catalogue" rather than faked.
