# Delegated action scopes — 17 October 2026

Cross-tenant requests require a live written authorisation for the exact
responsible operator, service provider and named action. A service provider's
normal authenticated role must also permit that route. A scope never bypasses
RLS, evidence review, publication, identity or Registry gates.

## Grant contract and rollout

The responsible operator creates an authorisation through `POST /authorisations`
with a verified written-authorisation evidence object and a flat `scope` object.
Only the Boolean values `true` and `false` are accepted, using the names below.
At least one known action must be explicitly `true`. Empty objects, unknown
keys, wildcards, nested values, strings and numeric values are rejected.

Example of a limited preparation grant:

```json
{
  "modelRead": true,
  "itemRead": true,
  "valueRead": true,
  "valueWrite": true,
  "passportPublish": false
}
```

Only the responsible operator can create, list or revoke its authorisations.
Delegated authorisation administration and re-delegation are denied. A future
unannotated API handler also denies cross-tenant access by default.

**Existing grants must be reviewed and explicitly reissued.** The old
`passportManagement` property has no alias or fallback. A persisted malformed
grant is unusable even if one of its properties otherwise matches. No database
migration silently grants actions to existing providers. A valid grant among
other unrelated or malformed active grants remains selectable.

`GET /organisations/authorised-customers` is an own-organisation discovery route.
It returns only current valid grants, customer identity, validity and the
explicit `availableActions` list. It does not return the authorisation document
storage key, document hash or raw persisted scope object. Discovery is advisory;
the API checks the grant again for every action.

## Named actions

| Scope | Permitted route action |
|---|---|
| `organisationRead` | Read the acting customer's organisation record |
| `organisationWrite` | Update its Registry enrolment profile; never mark external verification successful |
| `modelRead` | List/read battery models and their contained model dossier; model readiness |
| `modelWrite` | Create battery models |
| `applicabilityReview` | Record explicit conditional-field applicability review |
| `itemRead` | Read battery items, their contained item dossier and readiness |
| `itemWrite` | Create individual batteries, including bounded bulk creation |
| `valueRead` | Read a value and linked evidence metadata |
| `valueWrite` | Create/supersede unvalidated values |
| `valueReview` | Validate or reject current values, retaining provenance checks |
| `evidenceRead` | Read extraction jobs and suggested claims |
| `evidenceWrite` | Initiate/finalize evidence uploads and link evidence to values |
| `evidenceReview` | Issue a private review download or verify evidence; reviewer role still required |
| `evidenceExtract` | Request extraction; suggestions remain unvalidated |
| `supplierRead` | Read suppliers, requests and submission review metadata |
| `supplierWrite` | Create suppliers and manually deliverable request links |
| `supplierReview` | Accept supplier submissions as unvalidated values |
| `complianceRead` | Read field definitions and calculate checks on caller-provided data |
| `passportRead` | Read passport assessment/versions and obtain its QR; does not publish |
| `passportValidate` | Persist the current passport validation outcome |
| `passportPublish` | Publish a new immutable version after all current publication checks |
| `passportExport` | Issue the private operator export; explicit full dossier disclosure privilege |
| `lifecycleRead` | Read lifecycle events |
| `lifecycleWrite` | Record lifecycle events and telemetry |
| `accessGrantWrite` | Create/revoke scoped restricted-reader capability grants |
| `registryRead` | Read Registry gate/profile/readiness and local export outcomes |
| `registryPrepare` | Prepare local blocked Registry drafts/JSON/XML exports |
| `registrySubmit` | Request the separately gated submission action; currently records a blocked outcome only |

Scopes apply to these actions across the named customer's organisation, rather
than particular battery IDs. Read scopes include the contained dossier data
returned by those routes; they are not public access tiers. No write, review,
read or publication scope automatically implies another action. Public resolver,
supplier capability and restricted-reader capability routes retain their
separate access policies.

## Transaction boundary and revocation

The guard requires a current, unrevoked grant whose `validFrom` has arrived and
whose `validUntil`, if present, is strictly later than the request check. It
selects the matching Boolean action before establishing the acting context.

An interceptor carries the validated delegation through the handler's observable
subscription and asynchronous work using `AsyncLocalStorage`; concurrent and
own-tenant requests do not share that context. Every customer `TenantDbService`
transaction then locks the exact grant `FOR SHARE` and rechecks its current
operator/provider, validity, revocation and strict scope before customer work.
The lock uses the already guard-validated responsible tenant RLS context so the
responsible-only write/row-lock policy remains enforceable. No customer callback
runs before the recheck. Another customer cannot be substituted in a delegated
transaction.

Revocation or scope changes committed before a transaction's recheck deny the
operation. An already authorised transaction holds the shared grant lock until
commit/rollback; revocation waits for that transaction, then blocks later work.
This serializes database operations, rather than claiming to cancel a completed
operation or recall an already issued download/capability. Grant expiry is
checked at transaction admission. Long-running transactions and provider-issued
capabilities remain bounded by their separate limits.

The boundary is each database transaction, not a multi-transaction HTTP request.
Some existing controllers perform a mutation and a later business-audit call in
separate transactions. If revocation commits between them, the later call can
fail although the earlier authorised mutation already committed. Its atomic
scoped-transaction audit remains. Do not interpret an HTTP error as proof that
no earlier transaction or external effect occurred; inspect the request's audit
and current resource state before retrying.

Grant creation/revocation audit metadata includes the exact scopes and validity.
A successful scoped customer transaction appends
`authorisation.scoped_transaction` within that transaction, with grant ID,
actor, required action, handler, provider and a server-generated request ID.
Failed/rolled-back transactions leave no success audit. Business audit events
remain separate. A successful database audit does not prove an external download
completed or that a reviewer understood its contents.

## Verification and acceptance limits

Unit regressions cover the route-policy inventory, strict malformed/legacy
contracts, action separation, multiple grants, own-tenant behavior, the
guard-to-transaction revocation gap and asynchronous request isolation.
PostgreSQL/API integration covers cross-action denial, malformed historical
records, explicit scope audit/discovery, expiry/revocation and a real lock-based
write/revocation serialization scenario. Existing evidence integration retains
exact-version download checks with the new grant creation contract.

These repository controls do not prove that live users, written authorisation
documents or production identity mappings have been accepted. Real-provider
MFA, ingress, customer role/grant acceptance, recovery and independent security
review remain Gate 7 work. Both Registry flags stay false.
