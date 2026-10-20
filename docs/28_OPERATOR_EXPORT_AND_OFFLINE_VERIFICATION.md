# Private operator export and independent verification

Prepared 17 October 2026. This is an engineering control, not a declaration of
legal compliance, EU registration or completed production/customer-exit acceptance.

## Access and coverage

`GET /v1/passports/{battery-item-uuid}/operator-export` returns a private JSON
attachment for the authenticated responsible organisation. Roles are limited to
`operator_admin`, `compliance_manager` and `service_provider_admin`. Delegated
access additionally requires a currently active written authorisation with the
strict Boolean `passportExport: true` action scope. `evidenceReview` or ordinary
passport-read permissions do not imply permission to export every access tier.

The export deliberately includes **all canonical access tiers**, including
authority-only data. Keep the file in private, access-controlled operator
storage; never place it in the public website, public resolver or a public Git
repository. Export is not a public/restricted-access capability. The existing
public-snapshot projection remains the only public passport delivery route.

The envelope contains:

- Selected organisation, model and item identity metadata as observed at export.
- The entire stored published history for this one physical battery, beginning
  at version 1, including exact canonical values, stored SHA-256 hashes, previous
  version hashes, ruleset/schema references and publication times.
- Explicitly selected current metadata for evidence IDs referenced by those
  canonical versions: source SHA-256, byte length, immutable storage-version ID,
  verification/scan metadata and issue/expiry times when available.
- An export ID, export time, payload SHA-256 and explicit coverage/exclusions.

The API checks the stored version chain and canonical hashes before issuance,
uses tenant RLS and the existing model-before-item lock order, writes an audit
event with the export ID and payload hash, and fails if that audit write fails.
The only mutation is the export-issuance audit event. Passport state, values,
publication versions and Registry state do not change. Closed/recycled passports
remain exportable. Unpublished batteries return a conflict rather than an
invented published dossier. Responses are attachments with private/no-store.

Server limits are 256 versions, 5,000 distinct referenced evidence objects and
8 MiB per JSON export. Oversized histories require a separately reviewed offline
export; they are never silently truncated. Canonical JSON byte size is checked
in PostgreSQL before loading the complete history.

## Limits that must remain visible

The API response **does not contain source-document bytes**. It contains neither
storage credentials, signed download links, capability-token hashes, supplier
contact details nor Registry credentials. These internal tables are not exported.
The canonical operator-provided field values are intentionally retained exactly
as published; operators must treat their contents as confidential too.

Referenced evidence metadata is read at export time. Older publication records
contain evidence IDs but did not freeze all evidence metadata at publication.
This export therefore cannot attest to the historical source status/bytes at
every original publication time. Missing evidence references are listed; absent
SHA/length/immutable-version metadata prevents successful source-archive
verification. Never invent those missing records or reinterpret a current
document as a historical attestation.

The export also excludes drafts/current unpublished values, the full audit log,
lifecycle-event/telemetry history, supplier submissions, Registry submissions,
domain/resolver transfer, access grants/secrets and successor deployment/recovery
configuration. It is **not a complete customer-exit archive** even when every
referenced source file has separately been collected and byte-verified.

## Independent verification without our service

`scripts/passport-export.cjs` uses only the Node.js standard library. It does not
call the API, object storage, database or any other network endpoint; no package
installation is required. Canonicalization matches the platform's persisted
sorted-key JSON representation, including omission of undefined properties.

Save the private API attachment as `passport-export.json`. On this Windows PC,
new exports, collected source files, archives and temporary verification files
belong below `E:\Data\Han23\Codex\EUBatteryPassport`, not on C:. Existing source
code remains at its current repository location.

Verify the envelope and complete version chain:

```powershell
node scripts/passport-export.cjs verify E:/Data/Han23/Codex/EUBatteryPassport/exports/passport-export.json
```

`internallyConsistent: true` means the supplied hashes and chain agree with the
supplied content. Anyone who can rewrite an entire unsigned archive can also
recompute its hashes. Preserve the issuance payload hash separately in trusted
operator custody or an independent audit sink. Supply that separately recorded
hash to anchor verification; do not obtain the expected hash from the same
untrusted archive you are trying to authenticate:

```powershell
node scripts/passport-export.cjs verify E:/Data/Han23/Codex/EUBatteryPassport/exports/passport-export.json --expected-sha256 <separately-recorded-64-character-hash>
```

For source-byte verification, collect each exact referenced immutable source
through an independently authorised private download or operator storage export.
The existing short-lived review download requires its own `evidenceReview`
permission and will not issue arbitrary historical/expired/rejected documents.
This offline tool intentionally does not fetch links or bypass that policy.
Name the local files `<evidence-uuid>.bin`, using IDs in the manifest, in a private
source directory. Original filenames are metadata only, never filesystem paths.

```powershell
node scripts/passport-export.cjs verify E:/Data/Han23/Codex/EUBatteryPassport/exports/passport-export.json E:/Data/Han23/Codex/EUBatteryPassport/exports/collected-sources --expected-sha256 <separately-recorded-64-character-hash>
```

The verifier checks every referenced source's byte length and SHA-256. Missing
files, altered bytes, missing metadata, unsafe IDs and symlinked source paths
fail. It does not execute documents or reinterpret a clean hash as malware or
regulatory approval. Sources are streamed with a 100 MiB per-file and 2 GiB total
bound; larger collections require a separately reviewed archive workflow.

Create a **new** portable archive directory, without overwriting existing files:

```powershell
node scripts/passport-export.cjs assemble E:/Data/Han23/Codex/EUBatteryPassport/exports/passport-export.json E:/Data/Han23/Codex/EUBatteryPassport/exports/collected-sources E:/Data/Han23/Codex/EUBatteryPassport/exports/new-successor-archive --expected-sha256 <separately-recorded-64-character-hash>
```

It copies the manifest, exact source files and this independent verifier, and
writes an integrity report only after rechecking the copied bytes. A failed
copy/verification may leave a new incomplete directory; it is not a successful
archive and no successful report is issued. No previous directory is removed.
New archive directories use mode `0700` and files `0600` on POSIX systems. These
modes do not establish Windows access-control lists: verify the target E: folder's
inherited ACL and private backup/encryption policy before collecting real data.
From an independent machine, verify again using the copied tool:

```powershell
node new-successor-archive/verify-passport-export.cjs verify new-successor-archive/passport-export.json new-successor-archive/sources --expected-sha256 <separately-recorded-64-character-hash>
```

`sourceBytesVerified: true` confirms the included referenced bytes match the
manifest; `completeCustomerExitArchive` remains false. Domain/identifier routing,
availability after provider cessation, permissions, legal retention, all omitted
records and restoration into a successor service still require a recorded,
separately accepted handover drill.

## Verification evidence and remaining acceptance

Regression tests cover hash/chain/content tampering, missing versions, identity
substitution, missing evidence metadata/files, changed source bytes, bounded safe
paths and an independent child-process re-verification using only the copied
tool. Synthetic fixtures contain no customer data and are not evidence that a
real customer has been migrated. The integration suite additionally exercises
real publications, RLS/foreign-tenant denial, anonymous/role denial, exact
delegated permission and revocation, audit issuance and unchanged stored versions.

Before calling a real handover complete, execute the drill with an authorised
customer's full evidence set, independently preserve the issuance anchor, supply
the omitted records under reviewed access policy, and prove stable URL/domain
continuity and restoration in the successor environment. Repository tests and a
portable JSON/source collection do not close Gate 7 or the persistence standard.
