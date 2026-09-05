# Verification record — 5 September 2026

## Gate 6 — internal Registry preparation verified

Gate 5 PR #13 is merged at `6972b2e`. Gate 6 is proposed in PR #14.
[PR CI run 33990468657](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33990468657)
and [push CI run 33990466349](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33990466349)
pass on `df8b1a50ebe744c8d349a56c07516a68757c16ac`.

| Check | Result |
|---|---|
| Clean locked install, Prisma generation/schema, all workspace typechecks | PASS |
| Rule tests | 21 / 21 PASS |
| Canonical JSON and Registry contract unit tests | 11 / 11 PASS |
| Source-level security/compliance checks | 43 / 43 PASS |
| API and web production builds | PASS — 13 generated pages |
| Real PostgreSQL/API/MinIO/Chromium integration | 65 / 65 PASS, no skips |
| Fresh-install and prior-schema migration upgrade | PASS |
| Isolated service cleanup | PASS |

The 65 cases retain the prior 48 and add 17 Registry scenarios, including 101
real API publications, 100/1 file splitting, trusted grouping, Chromium XML
parsing, hash reconstruction from stored JSONB, complete-request rejection,
rejected-result retrieval, current evidence/readiness, legacy metadata, RLS,
blocked preparation/submission and forged-success rejection.

Local unit/static tests, typechecks and production builds also pass. An additional
health-status guard is covered by the enabled-flags unit case; PR #14's latest
revision must retain green full CI before merge. Local integration services were
not started; the actual integration verification ran in GitHub's isolated setup.

Early CI failures came from fixture configuration: default HTTP identifiers were
correctly rejected, then a malformed legacy fixture left a schema column at its
default. Fixtures now explicitly use synthetic HTTPS identifiers and matching
malformed metadata. No HTTPS or immutable-version check was weakened. This is
not a measured pre-implementation regression comparison.

See `codex/GATE_6_REPORT.md` for scope. These are internal, non-uploadable
preparation fixtures; actual official template mapping and external response
ingestion remain unverified. No dependency or migration was added. Next is
Gate 7 after PR #14 review/merge. Older records below describe earlier revisions.

## Gate 5 — verified in GitHub Actions

Gate 4 PR #12 is merged at `e388103`. Gate 5 is proposed in PR #13.
[CI run 33988585085](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33988585085)
passes on `a2386e122521ae8b6d7979cacc23f1818c1a78e2` with Node 22,
PostgreSQL 16, the pinned MinIO fixture and headless Chromium on Ubuntu.

| Check | Result |
|---|---|
| Clean locked install and Prisma client generation | PASS |
| Prisma schema and four workspace typechecks | PASS |
| Rule-engine unit tests | 21 / 21 PASS |
| Canonical JSON unit tests | 4 / 4 PASS |
| Source-level security/compliance checks | 43 / 43 PASS |
| Nest and Next production builds | PASS — 13 generated pages |
| Real PostgreSQL/API/MinIO/browser integration | 48 / 48 PASS, no skips |
| Fresh database migration and policy/grant reapplication | PASS — both migrations |
| Upgrade from the initial schema with a published version | PASS — original row unchanged |
| Runtime grants, administrator writes and parent-cascade protection | PASS |
| Test-service cleanup | PASS |

The 48 scenarios comprise 14 tenant-isolation, eight disclosure, 12 evidence and
14 lifecycle cases. The migration-upgrade check executes separately before that
suite and must also pass. It recreates old UPDATE/DELETE grants, applies the new
migration and grant pack, verifies the stored row and checks trigger enforcement.
Expected denied-write errors in PostgreSQL logs are assertions, not test failures.

Schema/type checks, unit/static tests and both production builds also passed
locally. Local integration startup was rejected by the execution policy, so the
actual migration and integration results above come from GitHub's isolated test
environment. There is no measured pre-fix regression count for Gate 5. No
dependency versions changed. Check PR #13's latest revision before merging;
`codex/GATE_5_REPORT.md` documents rollout and remaining boundaries. Gate 6 is next.
Older records below describe their original revisions.

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
