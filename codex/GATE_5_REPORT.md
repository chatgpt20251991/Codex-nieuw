# Gate 5 — Local implementation, verification pending

Base: Gate 4 commit `0bcfa4def8245bc2af9dfeec15ce9cf7e5071e69`, PR #12.
Branch: `fix/gate-5-passport-lifecycle`. PR #12 is still open; Gate 5 is not merged,
pushed, deployed or integration-verified. Do not mark this gate complete.

## Code review findings and prepared changes

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
- Lifecycle predecessor IDs were only checked for UUID shape. The prepared API
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

## Tests prepared and checks performed

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

The local PostgreSQL/MinIO startup command was rejected by the execution approval
policy because `sandbox_approval` is false. The integration runner failed at its
initial PostgreSQL connection (`ECONNREFUSED 127.0.0.1:55433`). Neither the 48
integration tests nor the new migration has been executed on this revision.
There is no measured baseline regression count or green Gate 5 CI result.

## Required completion and rollout

1. In an environment permitted to write GitHub, merge the already-green PR #12
   with expected head `0bcfa4d`; retain Gate 4's security boundaries.
2. In an environment permitted to start the dedicated services, run the existing
   integration Compose setup and install/use the documented Chromium browser.
   Run the complete typecheck, unit/static, build and integration sequence. Fix
   failures without reducing the required 48 scenarios.
3. Exercise both migrations on a fresh database and the new migration on a copy
   of the prior schema. Reapply `db:rls`/the runtime grant pack after deployment.
   Verify table-owner and cascading-delete behavior, not only revoked grants.
4. Inspect the local draft, publish its branch/PR, and require GitHub CI on its
   exact revision. Only then treat Gate 5 as complete and start Gate 6.

The new migration prevents future rewrites; it does not rewrite or certify old
versions. Owners performing maintenance must account for the deletion trigger.
Roll out during a write pause so old API workers cannot bypass the new locking
protocol. Review historical field-67 mismatches and lineage records explicitly;
do not silently change immutable snapshots or assert old UUID links are verified.
The synthetic evidence is a test fixture, not a legal attestation. Production
OIDC, malware scanning, storage retention/continuity and legal review remain open.
Both live Registry feature flags remain false.
