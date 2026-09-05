# Verification record — 5 September 2026

Gate 1 and Gate 2 have been executed locally against the supplied V2.1 source.

| Check | Result |
|---|---|
| Clean npm ci from committed lockfile | PASS — 433 packages |
| Prisma client generation and schema validation | PASS — Prisma 6.19.3 |
| Four-workspace TypeScript checks | PASS |
| Nest production build | PASS |
| Next 15.5.25 production build | PASS — 13 generated pages |
| Rule-engine unit tests | 20 / 20 PASS |
| Existing source-level security/compliance checks | 43 / 43 PASS |
| Live PostgreSQL and HTTP API integration tests | 14 / 14 PASS |
| Migration deploy on a fresh test database | PASS — 29 models |
| Policy/grant reapplication | PASS — no duplicate-policy failures |
| Compose and GitHub Actions YAML parsing | PASS |
| Git whitespace/diff check | PASS |

Environment: Windows, Node 24.15.0, npm 11.12.1, PostgreSQL 16.14.
The test harness allows 60 seconds for API startup; an earlier 20-second startup
readiness limit failed during a clean-install run. The final full integration run
passed all 14 tests in about 10.5 seconds, without skips or mocked database/auth guards.

The integration suite covers a non-owner runtime role, forced RLS on all 27 tenant
and relationship tables, missing tenant context, cross-tenant SQL and HTTP reads/
writes, concurrent tenant requests, evidence linking, invalid tokens, delegated
access, revocation and expiry, authorisation audit integrity, public/restricted
resolver functions and unvalidated supplier JSON null acceptance.

Docker/remote GitHub Actions were not executed on this Windows host. Local tests
used actual PostgreSQL Windows binaries. The equivalent Docker/CI configuration is
included. Production OIDC, MinIO upload E2E, malware scanning, full publication/
lifecycle E2E, backup/restore and live EU Registry integration remain pending.

See codex/GATE_1_REPORT.md and codex/GATE_2_REPORT.md for changes and boundaries.
Regulatory requirements inherited from the source ZIP were not re-verified in this
engineering pass. No EU registration or production-readiness claim is made.