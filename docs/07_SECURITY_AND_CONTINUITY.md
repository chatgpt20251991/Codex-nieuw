# Security, Access & Continuity Model — v0.1

## Access tiers
1. PUBLIC
2. LEGITIMATE_INTEREST_MODEL
3. AUTHORITY_ONLY
4. LEGITIMATE_INTEREST_ITEM
5. INTERNAL_OPERATOR
6. SERVICE_PROVIDER_ADMIN

The exact legal audience for "legitimate interest" must remain configurable until the Article 77(9) implementing act is adopted.

## Core controls
- OIDC/SAML for authenticated organisations
- MFA mandatory for privileged roles
- short-lived tokens
- tenant isolation
- PostgreSQL RLS + service-layer authorization
- encryption at rest with KMS
- TLS 1.2+ / prefer TLS 1.3
- private object storage
- signed temporary evidence URLs
- WAF + rate limiting
- immutable version records
- append-only audit events
- evidence hashes
- key rotation
- backup restore tests
- security incident runbook
- GDPR minimization for personal data

## Data-use restriction
Customer passport data is never:
- sold
- used for advertising
- trained on for unrelated models
- repurposed for benchmarking without separate lawful basis/permission
This reflects Article 78(d)'s service-purpose limitation.

## Continuity after customer exit
Design a legally reviewed continuity mechanism before production:
- contract authorisation for continued DPP availability
- prepaid/escrowed or pooled continuity reserve
- export to successor provider
- read-only archive mode
- EU-based redundant storage
- domain/identifier continuity plan
- disaster recovery runbook
- provider wind-down plan

Do not promise "lifetime hosting" commercially until funding, retention and succession mechanics are contractually sustainable.

## Standards roadmap
Already cited in OJEU:
- EN 18216:2026 — Data exchange protocols
- EN 18219:2026 — Unique identifiers
- EN 18220:2026 — Data carriers
- EN 18221:2026 — Data storage, archiving and persistence
- EN 18222:2026 — APIs for lifecycle management/searchability
- EN 18223:2026 — System interoperability

Additional JTC 24 standards:
- EN/prEN 18239 — Access rights management, information system security and business confidentiality
- EN/prEN 18246 — Data authentication, reliability and integrity

Do not invent detailed requirements from standards we have not legally obtained/reviewed. Add compliance profiles after reviewing the official texts.
