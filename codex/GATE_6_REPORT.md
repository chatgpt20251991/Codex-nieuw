# Gate 6 — Internal Registry preparation contract

Gate 5 PR #13 was merged at `6972b2e`. This Gate 6 branch is
`fix/gate-6-registry-contract`. Integration verification is pending; local rule,
canonical/contract unit tests and static checks pass. This report will be updated
with the actual GitHub CI result before the PR is marked ready.

## Source and scope

Read `docs/16_REGISTRY_CONTRACT_2026-09-05.md`. The Commission guide v1.02 of
24 August 2026 documents item-level battery preparation, HTTPS UPIs, JSON/XML,
100 requests per file and whole-file rejection. It still describes unavailable
successful battery registration. Downloadable templates exist inside the Registry
flow, but were not obtained; exact official keys, XML schema and API are unverified.

The fixtures are explicitly application-owned `eubp.registry-draft.v1` with
`uploadable: false`, `officialSchema: null`, and XML namespace
`urn:eubp:registry-draft:v1`. They are not official upload files or external-success
fixtures. Both live flags remain false. Even setting both flags true cannot
activate the absent adapter or change an internal draft to `ready`/`registered`.

## Changes and API behavior

- `POST /v1/registry/export-json` and `/export-xml` accept exactly `itemIds`:
  1..1000 unique UUIDs. Malformed, duplicate and unexpected inputs return 400.
- All requested items are checked before files or submission rows are created.
  Missing and foreign IDs both return `ITEM_NOT_AVAILABLE` within a 409
  `REGISTRY_PREVALIDATION_FAILED` response. Only supplied IDs are echoed.
  Current publication, current evidence/readiness, HTTPS UPI, immutable identity
  and hashes are checked. Changed, closed or incomplete items cannot export an
  obsolete publication. Input failures leave no partial submission rows/files.
- Tenant is authenticated. Model and item locks follow Gate 5's stable order.
  Validation and preparation persistence share one transaction. Only this bounded
  batch operation uses a 60-second transaction timeout; all other calls retain
  their defaults. This is not a production load-test result.
- Records include only internal identity, UPI, product identifier, category,
  passport schema/rule version and published hash. Canonical values, evidence,
  restricted fields and actor credentials are not serialized into the files.
- Records group by tenant/category/schema/rule version before splitting into at
  most 100. First-seen group order and caller order within groups are retained.
  Grouping and rejecting the complete candidate request are internal safety
  policies; the guide's limit/atomicity applies to an individual submitted file.
- Each request and file gets a local correlation ID. Each record is stored in
  `RegistrySubmission` as `blocked`, with method `internal_draft_json` or
  `internal_draft_xml`, ordered request metadata, record/file hashes, and the
  actual local blocked outcome. External correlation and Registry URI remain
  null; `submittedAt` stays null. `completedAt` records local preparation finish.
  One correlated audit event commits atomically with those rows.
- `GET /v1/registry/exports/:correlationId` retrieves tenant-owned submission
  results in stored file/record order. Rejected candidate sets are persisted in
  the append-only audit log and retrieved with a local rejection/error report and
  zero submissions. Unknown/foreign correlations return the same 404.
- Existing item `prepare` and `submit` routes accept an empty JSON object, use
  the same validation, and never permit a caller to supply external success.
  Prepare returns the blocked record; submit persists its blocked local attempt
  and returns 409. No external request is performed and passport state is untouched.

## Prepared verification

Seven contract unit tests cover golden JSON/XML fixtures, escaping/Unicode,
1/100/101/1000 limits, grouping, duplicate IDs across file boundaries, invalid
inputs and enabled-flags-without-adapter truth behavior. Four canonical and 21
rule tests and all 43 static checks remain mandatory.

Seventeen new integration scenarios use real PostgreSQL/RLS, API publications,
verified MinIO evidence and Chromium's XML parser. They cover 101 actual
publications split as 100/1, stored payload/file hashes and reconstruction,
strict input, a bad item after 100 good items, current state/readiness/expiry,
unsafe UPIs, tenant isolation, rejection retrieval, EV/LMT grouping, preparation,
blocked submission, spoofed success and malformed legacy contract metadata.
All 65 integration scenarios and the
existing fresh-install/migration-upgrade check are required, without skipping.

## Remaining boundaries

No new schema migration or dependency was needed: existing submission and audit
tables store the local results. Existing runtime grants and RLS apply. Historical
submissions are not rewritten. Local and external correlation IDs must remain
distinct when a real adapter is added.

Actual Registry upload mapping and response ingestion await the official
templates/semantic assets, authenticated test access and verified real responses.
The current result persistence is for local blocked/rejected outcomes. It is not
an external response parser, live integration, EU registration or production
readiness certification. Keep these constraints when proceeding to Gate 7's
production launch blockers.
