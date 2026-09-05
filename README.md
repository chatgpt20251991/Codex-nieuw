# EUBatteryPassport.nl Platform V2.1

Production-minded pre-release codebase for a managed EU Battery Digital Product Passport platform.

## What V2 implements

- Multi-tenant organisations and service-provider acting-on-behalf-of workflow
- Written-authorisation gate for cross-tenant access
- PostgreSQL row-level-security policy pack
- 71-point regulatory rule engine with EV / LMT / industrial applicability
- Conditional applicability context instead of silently treating all conditional points as mandatory
- Battery models + individual physical battery items
- Evidence graph with content-byte SHA-256 verification
- Private S3/MinIO direct uploads via short-lived signed URLs
- Manual evidence verification before a passport value may be validated
- Pluggable evidence extraction whose outputs are suggestions only
- Supplier data room with expiring capability tokens and field-specific requests
- Immutable passport versions with SHA-256 hash chaining
- Separate public passport projection table to prevent restricted-data leakage
- Stable resolver/UPI service and SVG QR generation
- Restricted-access capability grants for legitimate-interest tiers
- Lifecycle events and BMS/telemetry ingestion
- Registry pre-validation, max-100 batching and hard anti-fake registration gate
- Separate EU Registry identities for responsible economic operator vs DPP service provider/value-chain actor
- Verification-lifetime gate (electronic-ID expiry and hard three-year ceiling)
- Registry enrolment profile for legal name/address/NTR-LEI-VAT-eID/contact/legal representative preparation
- OIDC production auth + isolated development-token mode
- Enterprise-style Next.js operator workspace and supplier/restricted portals

## Truth status

This repository deliberately does **not** claim that a battery is EU registered merely because a passport was generated or published. Live Registry submission is feature-gated and disabled by default.

The regulatory configuration is based on the European Commission battery-passport guidance updated 15 August 2026 and the Registry sources re-checked on 5 September 2026 and must be reviewed whenever the Commission updates guidance, the battery semantic catalogue or access-right rules.

## Local development

Prerequisites: Node 22.12+, Docker, npm. CI uses Node 22; the initial local validation used Node 24.15.

```bash
cp .env.example .env
docker compose up -d
npm ci
npm run db:generate
npm run db:deploy
# Apply RLS AFTER Prisma has created the tables:
npm run db:rls
npm test
npm run dev --workspace @eubp/api
# In a second terminal:
npm run dev --workspace @eubp/web
```

Web: http://localhost:3000
API: http://localhost:4000/v1
MinIO console: http://localhost:9001

The API uses `DATABASE_URL` (eubp_runtime). Prisma migrations use
`DIRECT_DATABASE_URL` (eubp_migrator). `DATABASE_ADMIN_URL` is used only by the
separate policy/grant script. Never configure the API with the administrator URL.
Docker creates these roles only on a fresh volume. Existing databases need explicit
role provisioning and credential migration; do not delete a volume containing data.
Creating future migrations with db:migrate also needs a separately configured disposable
Prisma shadow database or a development-only role allowed to create it. The runtime
role must never receive that privilege; normal startup uses db:deploy.

## Gate 2–4 integration tests

```bash
docker compose -f docker-compose.integration.yml up -d --wait
npx playwright install chromium
npm run db:generate
npm run test:integration
docker compose -f docker-compose.integration.yml down
```

The suite creates an isolated database on the local PostgreSQL server on port 55432,
applies the committed migration using the non-superuser migrator, applies the RLS
pack, and runs real HTTP requests against the built Nest API using the non-owner,
non-BYPASSRLS runtime role. Only the generated test database is removed afterwards.
For a different local test cluster, set `TEST_DATABASE_ADMIN_URL` to its `/postgres`
database. This suite never accepts a remote server or an application database as
its cleanup target. The Docker test cluster is disposable and contains no customer data.

The non-login `eubp_resolver` role owns the three minimal resolver functions and
can SELECT only their public projection/token-context tables. It has no BYPASSRLS
privilege and no access to canonical passport values or evidence. Every tenant-owned
table, including relationship tables and authorisations, enforces RLS.

The integration command also publishes a real 71-field passport and checks public
and restricted disclosure. Public responses expose only public fields and public
identity metadata. Capability responses add only the exact granted tier; field 50
is never available through capability links. Internal IDs and provenance metadata
are excluded. The lifecycle-status alias follows field 67's configured tier.

Grants require a battery, an allowed tier and a finite expiry. Future, expired,
revoked or malformed grants fail closed. Revoke a grant with authenticated
`POST /v1/access-grants/:id/revoke`; tenant RLS and an atomic audit event apply.
See `codex/GATE_3_REPORT.md` for test scope and legacy-snapshot rollout notes.

Gate 4 uses a real, private MinIO bucket on loopback port 59000 and a headless
Chromium browser. A fixture page on port 18080 hashes a File, obtains a signed PUT
from the API, uploads across origins and finalizes it. The suite checks missing,
corrupt and replaced bytes, checksum headers, size, supplier ownership, evidence
verification/expiry, value provenance and suggestions-only extraction. It is a
browser transport test; it does not click through the complete Next.js workspace.
Only its randomly named test bucket is emptied and removed. All 34 integration
tests are required; missing PostgreSQL, MinIO or a browser fails the suite.

CI installs Chromium with `npx playwright install --with-deps chromium`. To use
an existing compatible local browser, set `TEST_BROWSER_EXECUTABLE` to its absolute
executable path. `TEST_S3_ENDPOINT` can select another dedicated loopback MinIO
port. Native MinIO must use the synthetic credentials and CORS origin in
`docker-compose.integration.yml`; never use customer storage for this suite.

The integration Compose file pins a historical MinIO protocol fixture by digest,
exposes it only on loopback and keeps its data in temporary memory. This fixture
is not a production storage recommendation or a storage security certification.
See `codex/GATE_4_REPORT.md` for the version boundary and remaining production work.

## Production gates before first real customer

1. Run a full `npm install`, Prisma validation/migration generation and full compile in CI.
2. Use separate migration and runtime PostgreSQL roles; runtime role must not own tables or have BYPASSRLS.
3. Apply and integration-test the RLS policy pack.
4. Configure real OIDC; production startup refuses development auth.
5. Configure EU-region object storage/KMS and malware scanning.
6. Review/licence the six cited EN 182xx harmonised standards and implement exact identifier/data-carrier/API profiles.
7. Replace draft Registry adapter with the official tested battery Registry contract when available/configured.
8. Legal review of service-provider authorisation, data-processing terms, continuity/wind-down and legitimate-interest access policy.
9. Pen test, dependency/SBOM scan, backup restore test and incident-response rehearsal.

## Codex

Start with [`AGENTS.md`](AGENTS.md), then [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md). Do not begin by redesigning the UI. First make the codebase reproducibly installable, migrate the database and pass the full integration gates.
