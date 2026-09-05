# Gate 7 — production security engineering

Base: PR #14 merged at 68b15a2. Branch: fix/gate-7-production-security.
Status: repository implementation verified in PR #15; production acceptance remains open.

## Implemented controls

- OIDC: required issuer, API audience, exp/iat/sub and exact UUID organisation
  claim; configured asymmetric algorithms; bounded JWKS cache and TLS verification;
  explicit role mapping with operator_user as the least-privileged default.
  Production refuses dev authentication, missing HTTPS portal URLs and missing scanner.
- Evidence: ClamAV scans the same stream that is hashed. A clean attestation binds
  SHA-256, scan time, engine/database version and immutable storage version.
  Detections reject evidence and invalidate linked draft aggregates. Existing
  published versions remain immutable. Extraction never validates evidence.
  The nullable migration deliberately leaves legacy scan attestations absent.
- Request limits: bounded per-process limits and stricter capability/authentication
  limits, without trusting forwarded addresses. Structured request logs contain
  route templates and request IDs, never raw token paths, bodies or credentials.
- Browser: fresh per-document CSP nonces, dynamic uncached rendering, explicit
  service origins and security headers. API uses Helmet defaults and no-store.
- Recovery: isolated PostgreSQL dump/restore with hash-chain, role, RLS, grant,
  public-projection and immutability verification; no repair after restore.
- Supply chain: exact direct dependency pins, lockfile, installed-tree validation,
  complete-workspace CycloneDX SBOM, advisory audit, full-history redacted Gitleaks,
  and CodeQL with a fail-closed SARIF gate.

## Dependency remediation

PostCSS is overridden to 8.5.28 and deepmerge-ts to 8.0.2. The latter is a major
replacement under Prisma 6.19.3, so client generation, database migrations,
restore and API integration must pass before approval. Next remains 15.5.25.
The root explicitly declares its Prisma and Next build tools as well as the
workspace declarations. This keeps overrides effective across npm's workspace
link boundary; see [npm issue 9659](https://github.com/npm/cli/issues/9659).
No dependency or advisory is allowlisted. Inspect the installed tree as well as
the audit, because an incomplete lockfile can otherwise appear advisory-clean.

The local installed-tree check is valid and the post-update advisory audit reports
zero known vulnerabilities at execution time. That does not establish absence of
unknown vulnerabilities, container vulnerabilities or deployment errors.

## Verification ledger

Local: Prisma generation, all-workspace typecheck, 21 rule tests, 33 API/security
unit tests, 43 source checks and the full production build passed.

On 293a0f9, both [PR CI run 33993837120](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33993837120)
and [push CI run 33993833842](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33993833842)
passed clean installation, Prisma generation/schema validation, all-workspace
typechecks, 54 unit tests, 43 source checks, production builds and all 99
integration scenarios without skips. The separate old-schema upgrade preserves
existing versions and leaves legacy evidence unscanned. The real dump/restore
exercise preserves three immutable versions, 27 tenant tables, RLS, grants,
public projections and the version hash chain.

The [PR security run 33993837110](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33993837110)
and [push security run 33993833840](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33993833840)
also passed every check. The full lockfile SBOM has 461 package identities
including its root, with zero npm advisories, zero Gitleaks findings and zero
reported CodeQL findings. Findings were fixed, not suppressed.

The integration breakdown is 65 retained Gate 2–6 scenarios, 17 HTTPS OIDC
scenarios, six real ClamAV scenarios, five concurrent supplier-review scenarios
and six browser/CSP scenarios. The prefetch rejection is a tested Next 15 boundary;
valid RSC prefetch, hydration and navigation still work. A follow-up documentation
revision must retain green checks on the PR's current head before merge.
Local PostgreSQL/MinIO service startup remains unavailable under the session's
approval policy; service integration is performed in GitHub's disposable fixture.

## Required external evidence before Gate 7 can close

1. Choose the real identity provider, configure API access-token audience and
   administrator-controlled organisation/role claims, then verify real tenant A/B
   logins, revocation and rotation. The HTTPS issuer in CI is a synthetic fixture.
2. Deploy and verify EU production storage versioning, retention/KMS and restricted
   scanner connectivity with maintained signatures. The CI ClamAV database and
   MinIO image are disposable test fixtures.
3. Configure the actual WAF/TLS ingress, trusted-proxy boundaries and shared limits;
   exercise alert routing and confirm log redaction in the chosen monitoring system.
4. Exercise encrypted production recovery, including object versions and keys,
   with an agreed RPO/RTO, and retain the signed operational evidence.
5. Perform the scoped external penetration test and close its findings.

Main branch protection is now enabled and was read back through GitHub's API.
All five CI/security checks are required and bound to GitHub Actions, with an
up-to-date base, a pull request and resolved conversations. Administrators are
covered; force pushes and branch deletion are disabled.

See docs/17_SECURITY_AUTOMATION.md through docs/21_PRODUCTION_SECURITY_RUNBOOK.md.
No production deployment, real-provider login, real backup recovery or penetration
test is implied by fixture success. Both live Registry flags remain false.
