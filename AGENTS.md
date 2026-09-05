# AGENTS.md — EUBatteryPassport.nl

You are working on compliance infrastructure, not a demo QR generator.

## Read first
1. `CODEX_HANDOFF.md`
2. `README.md`
3. `docs/01_MASTER_BLUEPRINT.md`
4. `docs/02_71_DATA_POINTS.json`
5. `docs/13_REGULATORY_ASSUMPTIONS.md`
6. `docs/12_SECURITY_THREAT_MODEL.md`

## Non-negotiable truth rules
- Never display or persist `registered` because a passport was merely generated, published or exported.
- A successful live EU Registry response/identifier is the only acceptable basis for `registered`.
- Keep `BATTERY_SEMANTIC_CATALOGUE_AVAILABLE=false` and `REGISTRY_BATTERY_SUBMISSION_AVAILABLE=false` unless official integration has been verified in the target environment.
- Never promote extractor/LLM output directly to a validated passport value.
- Never expose `authority_only`, `legitimate_interest_model` or `legitimate_interest_item` through the public resolver.
- Never trust `organisationId` supplied in a JSON body. Tenant comes from authenticated context or a validated capability token.
- Cross-tenant service-provider access requires a live `WrittenAuthorisation` record.
- Never remove evidence/provenance gates to make a demo look complete.
- Published passport versions are immutable. Changes create a new version.

## Architecture rules
- Regulatory applicability and access policy are configuration/rule driven.
- Use the `TenantDbService` RLS transaction for tenant-owned tables.
- Public passport delivery uses `PublicPassportSnapshot`, never `PassportVersion.canonicalJson`.
- Supplier/access capability tokens are stored only as SHA-256 hashes.
- Evidence bytes are content-hash checked before they become usable.
- Production auth is OIDC. Dev token issuance must remain impossible when `NODE_ENV=production`.
- Do not add blockchain unless a concrete requirement justifies it.

## First Codex mission
Run the exact sequence in `codex/NEXT_TASKS.md`. Fix compile/migration/integration problems before feature expansion.

## Definition of done for any PR
- tests added/updated
- no cross-tenant data leakage
- no public restricted-data leakage
- no fake compliance/registration state
- audit event for security/compliance mutations
- documentation updated when regulatory behaviour changes
