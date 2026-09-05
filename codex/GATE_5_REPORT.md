# Gate 5 — Passport lifecycle verified

Base: Gate 4 PR #12, merged at `e388103a91592c29328eefa258543762786cbc79`.
Branch: `fix/gate-5-passport-lifecycle`; review in
[PR #13](https://github.com/chatgpt20251991/Codex-nieuw/pull/13).
Implementation and integration verification are complete. This report does not
claim PR merge or deployment; inspect the current PR revision and its checks.

## Code review findings and changes

- Publication previously validated outside the transaction that read and
  serialized values. It now locks the model and item, validates those same values
  and appends the version, public snapshot and audit event in one transaction.
  Value creation/validation/rejection, evidence linking, supplier acceptance and
  lifecycle/telemetry writes use the same model-first lock order. This deliberately
  serializes publication/writes across items of a shared model; load testing and
  transaction-timeout tuning remain deployment work.
- Ready passports are invalidated by new values; published passports become
  updated. Historical values cannot be resurrected by validating a superseded or
  rejected row. Revalidating an unchanged publication preserves its state and
  does not enable another identical publication or erase a real Registry state.
- Published versions previously had runtime UPDATE/DELETE grants. The grant pack
  now revokes these operations. A migration adds an UPDATE/DELETE trigger for
  published versions, including attempted deletion through a parent cascade.
- Canonical hashing now follows persisted JSON semantics for undefined properties,
  array holes and Date values. Four executable unit tests cover JSON round trips,
  ordering and invalid roots. This is not a claim that all historical passport
  hashes were wrong; old rows and stored hashes are left untouched.
- Lifecycle predecessor IDs were only checked for UUID shape. The API
  requires the latest published version of the same item and tenant. Missing,
  invented, unrelated, foreign or stale predecessors fail. Cross-item/operator
  transfer is outside this route's current supported scope.
- Repurpose, reuse and remanufacture derive their matching lifecycle status.
  Optional conflicting status arguments fail. Generic `status_change` requires
  explicit `newLifecycleStatus: "waste"`; it cannot bypass lineage or recycling.
  Repair/accident events do not accept a status override. Each event records a
  system-controlled `payload.lifecycleTransition` and an atomic audit event.
- Recycling is terminal for API event, telemetry, item-value, validation and
  publication mutations. Historical views remain available. Shared model data can
  still change for active sibling items without reopening a recycled item or
  rewriting its published versions.
- Field 67 must agree with the item's lifecycle status before publication
  (`re-used` is accepted as the spelling of `reused`). A lifecycle event does not
  auto-validate this field: an operator must supply and validate its evidence.

## Tests and verification evidence

The 14 new real PostgreSQL/MinIO/API scenarios cover:

1. Organisation/model setup, actual evidence upload and manual verification,
   mandatory values, draft → ready → published v1 and stored/public hash checks.
2. New values, v2's prior hash and byte-for-byte unchanged v1.
3. Missing provenance and superseded-value rejection.
4. Concurrent publication yielding one version and one active public snapshot.
5. Concurrent publication/value writes never publishing the unvalidated value.
6. Runtime/owner rewrites and parent-cascade deletion of a published version.
7. Missing/invented/foreign/unrelated/stale predecessor links and tenant denial.
8. Repurpose with real lineage and manually validated current status.
9. Reuse with real lineage and manually validated current status.
10. Remanufacture with real lineage and manually validated current status.
11. Generic-event attempts to bypass dedicated transitions.
12. Recycling closure, including preservation of published history.
13. Model inheritance invalidation while preserving recycled state.
14. Revalidation without duplicate publication or fake registration.

The existing disclosure fixture now uses a valid `original` status for field 67.
The integration runner requires all 48 scenarios, without optional skipping.
Local schema/type checks, 21 rule tests, four canonical JSON tests and 43 source
checks pass. Nest/Next production builds also pass, with 13 generated pages.
No dependency versions were changed; installing new packages is unnecessary.

[GitHub Actions run 33988585085](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33988585085)
passed on `a2386e122521ae8b6d7979cacc23f1818c1a78e2`: clean locked installation,
Prisma generation/schema, all typechecks, unit/static tests, production builds
and all 48 integration tests, with zero failures or skips. CI uses Node 22,
PostgreSQL 16, the Gate 4 MinIO fixture and headless Chromium on Ubuntu. Local
test-service startup remained blocked by execution policy; the actual integration
results come from this isolated CI environment. No pre-fix regression count was
measured for Gate 5.

Before the fresh-install suite, a mandatory upgrade check deploys only the initial
migration into a separate generated database and stores a published fixture.
It restores the prior runtime UPDATE/DELETE grants, deploys the new migration,
reapplies policies/grants, and verifies that the original version is unchanged.
The check confirms revoked runtime privileges and rejects administrator updates
and parent-cascade deletion through the trigger. It passes, followed by a clean
deployment of both migrations and all 48 scenarios. The generated databases and
MinIO fixture are cleaned up. Denied-write errors in the logs are expected tests.

## Review and rollout

1. Review PR #13 and require green GitHub checks on its current revision before
   merging. The report's linked run records the verified implementation; later
   commits must retain the same complete checks.
2. At rollout, pause writes and replace old API workers so every writer follows
   the locking protocol. Deploy migrations and reapply `db:rls`/the runtime grant
   pack before resuming writes. The automated upgrade check covers the prior
   schema, not every possible production dataset.
3. After the Gate 5 PR is integrated, start Gate 6: official-document-based
   JSON/XML Registry adapter fixtures, max-100 batch validation and persisted
   correlation/results. Keep live submission and registration disabled until an
   actual successful official integration is verified.

The new migration prevents future rewrites; it does not rewrite or certify old
versions. Owners performing maintenance must account for the deletion trigger.
Review historical field-67 mismatches and lineage records explicitly;
do not silently change immutable snapshots or assert old UUID links are verified.
The synthetic evidence is a test fixture, not a legal attestation. Production
OIDC, malware scanning, storage retention/continuity and legal review remain open.
Both live Registry feature flags remain false.
