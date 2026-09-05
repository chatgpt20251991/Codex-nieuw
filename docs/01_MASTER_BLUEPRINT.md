# EUBatteryPassport.nl — Master Product & Technical Blueprint
Version 0.1 — 5 September 2026

## Mission
Build EUBatteryPassport.nl as a European Battery Digital Product Passport infrastructure provider, not merely a consultancy site.

The platform must support:
1. Scope/readiness assessment
2. Supplier data collection
3. Evidence/provenance
4. 71-point legal data model
5. Automated validation and cross-checking
6. Per-item passport creation
7. Unique identifiers and QR/data carriers
8. Public, legitimate-interest and authority access tiers
9. Lifecycle updates and telemetry
10. EU DPP Registry registration/adapters
11. Long-term persistence and customer-exit continuity
12. Audit-grade exports
13. Multi-tenant enterprise security

## Non-negotiable legal design principles
- Responsible economic operator remains legally responsible.
- EUBatteryPassport.nl acts only under written authorisation where acting on behalf of an operator.
- Customer DPP data must not be sold/re-used beyond delivery of the storage/processing service.
- The DPP is decentralised. Full passport data remains in the operator/service-provider database; the EU Registry indexes identifiers/registration metadata.
- Access must be free for entitled users, but role-restricted according to legislation.
- Data must be machine-readable, structured, searchable, interoperable and avoid vendor lock-in.
- Passport availability must survive the customer's cessation.
- Data authentication, integrity, security and privacy must be engineered, not added later.

## Product surfaces

### A. Compliance Console
- Organisation onboarding
- Legal role and authorisation
- Battery scope wizard (EV / LMT / industrial >2 kWh)
- Battery model setup
- 71-point readiness score
- Blocking / warning / future-requirement buckets
- Evidence completeness
- Registry status

### B. Supplier Data Room
- Invite suppliers without paid accounts
- Per-field requests
- Secure upload links
- Structured values + documents
- Due dates and reminders
- Supplier attestations
- Version tracking
- Mapping supplier data to model/passport values

### C. Evidence Graph
Every value carries:
- source type
- supplier / lab / internal owner
- source document
- source page/section where possible
- timestamp
- uploader
- validation state
- hash/integrity value
- superseded-by pointer
No bare value can become "validated" without provenance.

### D. Validation Engine
Four layers:
1. Schema validation
2. Legal applicability validation
3. Cross-field consistency validation
4. Evidence/provenance validation

Examples:
- capacity value and unit present
- category-specific mandatory field missing
- chemistry contradicts composition
- mass fractions exceed 100%
- min voltage > nominal voltage
- nominal voltage > max voltage
- dynamic fade incompatible with original baseline
- duplicate UPI
- manufacturing date after market placement date
- supplier evidence expired/superseded
- test report doesn't match battery model

### E. Passport Publisher
States:
DRAFT -> DATA_COLLECTION -> VALIDATION_FAILED / READY -> PUBLISHED -> REGISTRY_PENDING -> REGISTERED -> UPDATED -> SUPERSEDED -> RECYCLED

Never allow a passport to jump straight from draft to registered without validation.

### F. Resolver / QR
Stable HTTPS UPI endpoint per physical battery.
The public path must remain stable even if internal infrastructure changes.
Example conceptual route: https://id.eubatterypassport.nl/b/{opaque-id}
Do not freeze the exact identifier syntax until EN 18219/18220 implementation details are licensed/reviewed.

### G. Lifecycle & BMS
- time-series SoH/SoC/performance data
- cycle count
- events/accidents
- operating temperature/environment
- status transitions
- repurpose/reuse/remanufacture lineage
- original-passport links
- recycling termination state

### H. Registry Adapter
Use an adapter architecture:
- registry_manual_form
- registry_json_file
- registry_xml_file
- registry_api (activate only when official API integration details are available/stable)

Current constraint (2026-09-05):
Successful battery registration is not yet available because the battery semantic catalogue has not yet been defined.
The current Registry UI supports battery item-level registration and file batches up to 100 DPPs in JSON/XML.

## Recommended production architecture
AWS EU region first:
- CloudFront/WAF
- Application Load Balancer
- ECS/Fargate
- TypeScript NestJS API
- Next.js frontend
- PostgreSQL RDS Multi-AZ
- Redis/ElastiCache
- S3 + versioning + Object Lock for evidence
- KMS encryption
- Secrets Manager
- SQS/EventBridge for async jobs
- OpenTelemetry + centralized logs
- cross-region EU backup for continuity

MVP can run smaller, but code must preserve this target architecture.

## Key engineering principle
Never hard-code legislation in UI components.
All legal applicability, access levels, effective dates, validation rules and display rules live in versioned configuration/rule tables.

This lets us swap in:
- final battery semantic catalogue
- Article 77(9) access-rights act
- new Commission guidance
- EN 18239 / EN 18246 security/authentication requirements
without rebuilding the product.

## Hard launch gates
A passport cannot be marked COMPLIANT unless:
- applicable required points pass
- provenance passes
- required documents pass
- identifier passes
- role/access model passes
- QR resolves
- public viewer resolves
- restricted viewer authorization passes
- audit trail exists
- registry gate is either REGISTERED or explicitly PRE_REGISTRY if registry battery submission is still unavailable

Never label PRE_REGISTRY as REGISTERED.
