# Gate 7 — production security engineering

Base: PR #14 merged at 68b15a2. Branch: fix/gate-7-production-security.
Status: implementation under verification; this is not a production go-live approval.

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

Local: Prisma generation, all-workspace typecheck, 21 rule tests, 29 API/security
unit tests, 43 source checks and the full production build passed. Actual GitHub
integration/security job evidence will be recorded here after execution.
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
6. Require the CI/security checks through the repository's branch rules.

See docs/17_SECURITY_AUTOMATION.md through docs/21_PRODUCTION_SECURITY_RUNBOOK.md.
No production deployment, real-provider login, real backup recovery or penetration
test is implied by fixture success. Both live Registry flags remain false.
