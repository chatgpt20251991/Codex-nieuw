# Written authorisations and standalone evidence review

Engineering record, 12 November 2026. This implements operator administration;
it does not establish actual hosting, identity-provider, customer or EU Registry
acceptance. Keep the real production and Registry gates open until verified.

## Operator workflow

1. Open **Evidence**, upload a source document (non-empty, at most 100 MiB), and
   wait for byte-integrity and malware checks. Upload does not verify a source.
2. Select the stored document, request its short-lived version-pinned attachment,
   read it, and explicitly confirm its relevance, authenticity and validity.
   Record verification only after that review. Download issuance proves neither
   receipt nor review. The existing API independently rechecks the source bytes.
3. An operator administrator opens **Authorisations** in their own organisation,
   identifies the actual provider organisation and reviewed mandate document,
   selects the exact permitted actions, and specifies an end date. Review the
   provider, evidence, permissions and dates before the separate confirmation.
4. Inspect historical grants and explicitly revoke access when it should end.
   Legacy scope formats remain unusable and require a new reviewed grant; they
   are never silently converted. Repeated revocation retains the first timestamp
   and creates no duplicate success audit.

The document list shows the latest 100 tenant records. Grant lists paginate in
100-row pages, to an explicit 1,000-row console limit. An older reviewed evidence
UUID may be supplied to the management form; the server still verifies it.
List cursors must belong to the same responsible organisation or evidence tenant.
No list/create/revoke response contains a document storage locator or hash;
invalid historical scope JSON is not copied into responses.

## Security boundaries

All grant-management routes are own-tenant and operator-admin only. New grants
require a currently valid verified source with complete matching checksum,
clean ClamAV attestation, byte size and immutable storage version, including in
development. A shared source-row lock serializes issuance against rejection or
supersession, then the source is reread before grant and audit are committed.
An expiring source cannot support an unbounded or longer-lived new grant.

The source gate applies when issuing a new grant; it does not retrospectively
migrate existing grants or automatically recall previously issued capabilities.
Document status changes after issuance need an explicit mandate review and
revocation. Named action scopes, role checks, request-time validity and the
existing exact-grant transaction lock continue to apply. Existing multi-transaction
HTTP operations retain their documented transaction-level revocation boundary.

The console starts with no selected permission or evidence. Failed/uncertain
mutations require refresh and a fresh review rather than automatic replay.
Session/workspace changes invalidate pending requests and clear private state;
late responses cannot restore a prior organisation's records or trigger a stale
source attachment. Signed storage URLs stay out of React state, page text,
browser storage and logs. Upload destinations and checksum headers must match
the configured storage origin and locally computed content digest.

The production provider-to-customer workspace selector remains a separate
required console extension. This administration page does not invent delegated
customer context or replace the real Auth0 enrolment/MFA/role acceptance.

## Dependency and verification scope

The November platform audit required Next 15.5.29, Nest Express 11.2.10,
Multer 2.5.0, Zod 4.6.7 and a compatible fast-uri patch. Nest CLI moves to
12.0.12 to replace its obsolete glob/webpack/deepmerge build dependency chain;
the application remains on Nest 11, Prisma 6 and its TypeScript 5.9 declarations.
This build-tool major requires actual clean install, compile, integration and
production image checks; a zero-advisory lockfile alone does not prove compatibility.
No dependency finding or security scan is waived.

Validation installs/builds/caches remain on E:, with the existing C: source
checkout retained. Read TEST_REPORT.md and exact-revision GitHub checks for
results. Real customers, external emails, paid services and Registry submissions
are not created by these repository tests.
