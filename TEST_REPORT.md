# Verification record — 5 September 2026

## Gate 5 local preparation — integration verification pending

The Gate 5 branch is based on `0bcfa4d` (PR #12, still open). This revision passes
Prisma schema validation, all workspace typechecks, 21 rule tests, four canonical
JSON tests, and the 43 existing source checks locally. Nest/Next production builds
also pass (13 generated pages). The new JavaScript tests also
pass syntax checking. No dependency version changed.

The 14 new lifecycle scenarios are wired into the mandatory integration command,
bringing its planned total to 48. **These 48 tests have not run on this revision.**
Starting PostgreSQL/MinIO was rejected by the execution approval policy
(`sandbox_approval=false`); running the integration harness then failed with
`ECONNREFUSED 127.0.0.1:55433` before migration or test execution. The migration's
SQL behavior is therefore also unverified. There is no before/after integration
failure count for Gate 5 and no Gate 5 remote CI result.

The GitHub connector cannot merge PR #12 (HTTP 403); the authenticated CLI cannot
reach GitHub from the restricted shell. These blockers do not justify dropping
tests, weakening immutability or advancing to Gate 6. See `codex/GATE_5_REPORT.md`.
The green Gate 4 record below applies only to its original revision.

## Gate 4 evidence follow-up

PR #11 (Gate 3) is merged at `5546343`; its head revision passed GitHub Actions.
Gate 4 adds 12 scenarios using real MinIO, a real browser, the built API and
PostgreSQL. They cover signed browser PUT, corrupted bytes/checksums, absent
objects, forged metadata, size mismatch, replacement before verification,
idempotent finalization, supplier ownership, concurrent sessions, evidence expiry,
mandatory-value provenance, suggestions-only extraction and audit events.

| Check | Local result |
|---|---|
| Clean locked installation | PASS — 435 packages |
| Prisma client generation and schema validation | PASS — 6.19.3 |
| Four-workspace TypeScript checks | PASS |
| Rule-engine unit tests | 20 / 20 PASS |
| Source-level security/compliance checks | 43 / 43 PASS |
| Nest and Next production builds | PASS — 13 generated pages |
| Real PostgreSQL/API/MinIO/browser integration | 34 / 34 PASS, no skips |
| Compose and GitHub Actions YAML parsing | PASS |
| Git whitespace/diff check | PASS |

Windows verification used Node 24.15.0, PostgreSQL 16.14, MinIO
RELEASE.2025-09-07T16-13-09Z and headless Edge through Playwright 1.62.1.
The clean-install and Prisma download initially hit sandbox network restrictions;
rerunning with network permission succeeded. These were environment failures.
CI now provisions Chromium and the MinIO fixture and runs all 34 tests; the
GitHub PR checks are the authoritative remote result for each commit.

See `codex/GATE_4_REPORT.md` for regression findings and the historical test-only
MinIO version boundary. This verifies browser transport, not a full Next.js UI
journey. Production storage/security, OIDC, malware scanning, the full passport
lifecycle and live Registry integration remain separate gates. The older reports
below describe their original revisions; Gate 4 supersedes their pending evidence
upload test status. Next implementation work is Gate 5.

## Gate 3 review follow-up

The baseline `e9ee731` also passed remote GitHub Actions, including production
builds and all 14 PostgreSQL/API tests, in run 33982077710. This supersedes the
historical remote-CI limitation below for that baseline.

Gate 3 adds real publication/disclosure coverage. Before the fixes, 6/8 new
scenarios failed; after the fixes, all 22 integration tests passed (14 existing
plus 8 new), without skips. See `codex/GATE_3_REPORT.md` for findings, boundaries
and legacy-snapshot behavior. Evidence upload E2E remains Gate 4.

The Gate 3 revision also passed clean locked installation (433 packages), Prisma
generation/schema validation, all four workspace typechecks, 20/20 rule tests,
43/43 source checks, Nest/Next production builds (13 generated pages), and the
Git diff check locally. No dependency versions changed in this revision.

## Original Gate 1 / Gate 2 verification

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
