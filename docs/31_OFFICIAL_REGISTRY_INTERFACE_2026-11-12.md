# Official Registry interface material — 12 November 2026

The Commission now publishes Registry API specifications and battery semantic
assets. Their absence is no longer a reason to defer **offline mapping and
contract tests**. Publication does not establish successful battery registration,
target-environment availability, legal conformity or permission to enable the
live adapter. Gate 7 remains open and both live Registry flags remain false.

## Sources and retained provenance

The [Commission resources page](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/resources-documentation_en)
lists these technical publications dated 30 October 2026:

- Registry API Integration Guide, v1.0.
- OpenAPI specifications: three YAML files, OpenAPI 3.1.0, specification v1.0.0.
- Semantic Data Guide, v1.0, and semantic data artifacts.
- Service Account Technical Integration Guide, v1.0.
- Self-Hosted Authentication Guide for Economic Operators, v1.0.

It also lists the battery data-points guidance **v3.2, 19 October 2026**. That is a
separate review task: the active 71-point rule map still identifies its earlier
baseline. This investigation does not replace its applicability, access tiers,
validation rules or legal interpretations.

The two original ZIP downloads and their 81 individual data files are retained on
E: under `E:/Data/Han23/Codex/EUBatteryPassport/outputs/regulatory-2026-11-12`.
They were inspected as data; nothing downloaded was executed. The compact
[provenance manifest](regulatory/official/2026-10-30/manifest.json) records source
URLs, sizes, SHA-256 values and editions. SHA-256 records the observed bytes; it
is not a signature or independent proof of their authenticity. PDF text was
examined through the official publication URLs; a separate raw PDF download was
rate-limited, so no PDF byte hash is claimed.

## Availability must be described precisely

The new archive contains battery JSON Schemas, SHACL shapes, vocabularies,
JSON-LD contexts and examples for the common battery group and EV, industrial
and LMT subgroups. These public files are available for local development.

However, the resources page still links a
[Registry User Guide with cover v1.03, 16 September 2026](https://single-market-economy.ec.europa.eu/document/download/a71b5d30-ed8b-4c27-809d-757cf5e6030f_en?filename=dpp_registry_user_guide_for_economic_operators.pdf).
Its pages 48 and 54 still describe battery registration as unavailable pending
semantic content. That older statement and the newer assets must not be treated
as a verified current service result. The semantic repository root could not be
retrieved by the research tool, and no authenticated Registry request was made.
Whether the target environment has activated the catalogues and validation
service remains unverified. Keep `BATTERY_SEMANTIC_CATALOGUE_AVAILABLE=false`
and `REGISTRY_BATTERY_SUBMISSION_AVAILABLE=false`.

## Registration API contract

The [API Integration Guide](https://single-market-economy.ec.europa.eu/document/download/9bce584d-fd9c-453f-862c-55670d2757b7_en?filename=DPP+Registry+%E2%80%93+API+Integration+Guide+for+Economic+Operators.pdf)
and its accompanying YAML define:

1. Discover classification through `GET /api/v1/dpp/product-groups`.
2. Submit to `POST /api/v1/dpp/submission` with `productGroup`,
   `productSubGroup` and `submissionItems`. Each item has
   `uniqueProductIdentifier`, `granularity`, and optional `modelIdentifier` and
   `batchIdentifier` where applicable. Battery classification requires a
   subgroup; `EV` and `LMT` occur in examples. Do not invent an industrial API
   code from the semantic directory name `ind`; use actual reference data.
3. Preserve one `Idempotency-Key` for retries of the same logical request; a
   modified request needs a new key. Its maximum length is 128 characters.
4. A `202` response supplies a task acknowledgement, not registration. Inspect
   `/api/v1/tasks/{taskId}` and, where required, its paginated `/items` results.
   `COMPLETED` can have a failed business outcome; success requires the actual
   positive outcome for the correct request and items. A batch is atomic.

Enforce the documented 1–100 items, one classification, HTTPS UPI and 2,000-character
UPI ceiling explicitly. The YAML describes some constraints without fully
encoding them, including array cardinality and HTTPS. Its generic granularity
enum includes model/batch/item; it does not justify weakening this platform's
per-physical-battery policy. Placeholder specification hosts are not deployment
configuration. The existing `eubp.registry-draft.v1` envelope is an internal
format and must never be submitted unchanged as this official JSON request.

## Two different authentication directions

### Our service account calls the Registry

The [Service Account Guide](https://single-market-economy.ec.europa.eu/document/download/b42673d1-90db-4c0c-b54e-37fa9e0ac6c6_en?filename=DPP+Registry+%E2%80%93+Service+Account+Technical+Integration+Guide.pdf)
specifies client credentials with `private_key_jwt`, rather than a shared client
secret. Registered EC keys use ES256/ES384/ES512. Assertions use
`typ=client-authentication+jwt`, the client ID as issuer and subject, the configured
Authorization Server issuer as audience, a fresh `jti` and a short lifetime.
Access tokens last at most 900 seconds. Keep private keys local and reuse valid
access tokens; do not create accounts or credentials as part of offline tests.

The guide identifies separate Acceptance and Production Authorization Servers
and Registry API bases. The OAuth resource identifier is not the API base URL.
All values must come from the target environment's published configuration and
must remain separate from the portal's Auth0 customer sign-in.

### The Registry reads a passport hosted by us

The [Self-Hosting Authentication Guide](https://single-market-economy.ec.europa.eu/document/download/56a7f4ca-5e75-4f9e-adac-fd86f88f2b16_en?filename=DPP+Registry+%E2%80%93+Self-Hosted+Authentication+Guide+for+Economic+Operators.pdf)
defines a separate Resource Server trust path. It requires ES384 access tokens
with `typ=at+jwt`, the exact environment issuer, `principal_type=SYSTEM`, required
identity/time claims, at most 120 seconds' lifetime, the configured external
HTTPS origin as audience, and exactly `dpp:registry:read` as scope. The sole
`resource_requestor_identifiers` entry must have type `ORG_IDENTIFIER` and exactly
match the locally authoritative verified identifier for the requested passport.

Without Authorization, return only the public representation. An invalid presented
Bearer token must receive 401, without falling back to public content. A valid
token with insufficient scope or the wrong requestor receives 403 without private
data or disclosure of the expected identifier. Shared-origin audience validation
does not replace tenant/requestor authorization. This protocol is not an Auth0
customer token or the existing legitimate-interest capability mechanism.

## Semantic profiles and safe mapping work

The downloaded semantic JSON Schemas use draft 2020-12 and versioned references.
Core fields include `digitalProductPassportId`, `uniqueProductIdentifier`,
`granularity`, `dppStatus`, `lastUpdate` and `contentSpecificationIds`. Public
battery data composes core, battery-group and subgroup schemas. Data types include
controlled-vocabulary IRIs, structured manufacturer identity, unit/value objects,
language-keyed objects and typed related-resource links. Passing arbitrary strings
through the current canonical value array is not an official serialization.

The archive distinguishes public, RES1, RES2 and RES3 files; notably RES2 contains
compliance-test-report results restricted to authorities/notified bodies/Commission.
Treat these as mapping inputs, not permission to broaden existing access policy.
Preserve the public snapshot boundary and never add restricted data to an anonymous
resolver while implementing a new profile. No complete field-by-field mapping or
standard-conformance assessment was performed in this investigation.

## Standards and access-rule status

The verified [OJ Decision (EU) 2026/1736](https://eur-lex.europa.eu/eli/dec_impl/2026/1736/oj/eng)
lists EN 18216/18219/18220/18221/18222/18223:2026. A later OJ citation for
EN 18239/18246 was not established by this investigation. The
[current Commission battery FAQ](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/eu-digital-product-passport-faq-batteries_en)
still reports six cited standards and describes the restricted-access act as
forthcoming. Its
[indicative timeline](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en)
places the remaining standards in November and the access act in Q4 2026. A
planned date is not an adopted act. Full lawfully obtained standard texts remain
unreviewed; these public guides do not replace that work.

## Next engineering work, with no live activation

- Pin and review the observed official artifacts; register schema references in
  an offline allowlist. Never fetch arbitrary schema/context URLs supplied by a
  customer or silently follow changes to a mutable online resource.
- Build a separate versioned mapper from reviewed immutable publication values
  to official view-specific documents. Report missing/ambiguous values and units;
  do not invent defaults, change already published hashes or relax provenance.
- Add contract tests for request cardinality/classification, UPI rules, idempotency,
  asynchronous acknowledgements, failed completed tasks, atomic batches and item
  result matching. Use synthetic responses that are clearly not Registry evidence.
- Prepare the two authentication profiles independently, with negative JWT,
  issuer/audience/requestor, expiry, key-rotation and leakage tests. Existing
  customer login must not gain access to this machine trust path.
- Review v3.2 guidance separately against the current 71-point catalogue and
  document any proposed change before versioning active rules.
- Only after verified organisation onboarding and actual target-environment
  integration may a later reviewed release consider changing live flags. Software
  tests and publicly downloadable assets do not close Gate 7 or establish an EU
  registration result.

## Local request preparation module

`apps/api/src/modules/registry/official-registry-contract.ts` provides an isolated
pure converter, without a controller, live adapter, credentials or network access.
`prepareOfficialRegistryRequest` accepts one prevalidated internal draft batch of
1–100 records, explicit catalogue observations, a category mapping and review
metadata. Hashes bind the exact supplied catalogue and mapping to that review.
The review is caller-recorded metadata, not authenticated Registry evidence.
Synthetic observations must identify their environment as synthetic; no industrial
code is inferred. Ambiguous mappings, missing observed subgroup codes, duplicate
items/UPIs/publications or mixed category/schema/rules batches fail completely.

The converter preserves each UPI exactly, uses item granularity and leaves out
optional model/batch identifiers that the internal draft does not contain. It
never substitutes the serial number for either identifier. Required retry keys
are supplied by the caller; an optional previous-preparation fingerprint binds
the request body, source publication IDs/hashes and environment. This rejects
key reuse after a publication changes while keeping the same UPI, as well as
replacement keys for an unchanged retry. This
local comparison does not replace durable idempotency tracking in a future adapter.
Resource bounds on reference data and local metadata, and visible-ASCII header
values, are conservative local preparation policy rather than extra EU requirements.

The returned request and source bindings are frozen copies. They do not recheck
tenant authorization, current database state, canonical bytes or source evidence;
the caller must obtain records through the existing authenticated preparation
service and repeat the necessary checks before any future submission. Every
result remains preparation-only with `liveActivationApproved:false` and no
`registered` field. Request/schema preparation is not validation of the hosted
passport against the new official semantic profiles.

`inspectOfficialRegistryAcknowledgement` inspects only the published required
acknowledgement fields from HTTP 202 and optionally checks the correlation ID.
It never classifies final task/item outcomes positively. Dashboard message codes
are open strings, and many result fields are optional in the public schema;
complete task, organization, request, item and atomic-batch matching belongs in a
separately reviewed response adapter. A `COMPLETED` label, success-looking message,
URI or mixed-item counters cannot establish a positive final result through this
module. Its regression fixtures are synthetic and send no external request.
