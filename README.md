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

Prerequisites: Node 22+, Docker, npm.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
# Apply RLS AFTER Prisma has created the tables:
./scripts/apply_rls.sh
npm test
npm run dev
```

Web: http://localhost:3000
API: http://localhost:4000/v1
MinIO console: http://localhost:9001

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
