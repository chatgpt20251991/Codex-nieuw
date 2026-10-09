# Customer passport workflow — 9 October 2026

The operator console now uses the existing tenant-protected API for a real
model-to-battery workflow. This release prepares usable software; it does not
provision infrastructure, accept customer documents, send email or establish
conformity or EU registration.

## Operator route

1. `/onboarding` checks the authenticated organisation and, where absent, asks
   for its actual legal details. It never creates demo models or random serials.
2. `/models` creates a category-specific model and individual battery using
   the operator's actual serial/item identifier. Model and battery identifiers
   persist on the API. Dossier links can be reopened after browser reload.
3. `/suppliers` creates field-specific, expiring invitations. Link creation is
   a `draft` with no `sentAt`; delivery is `manual_link/not_sent`. The raw
   capability appears once in the response and only in browser component state.
   Neither the create nor list/detail responses expose the stored token hash.
   Opening a draft or historical `sent` link records `opened`, without inventing
   delivery evidence. The detail route remains tenant-bound and projects only
   review metadata. Reviewed submissions import as unvalidated supplier values.
4. `/evidence` uploads bytes to private storage and checks integrity. Reviewers
   in dossier and supplier screens can request a short-lived attachment download
   of the exact finalized, clean-scanned storage version. Only authorised review
   roles can issue one, with tenant checks and an issuance audit. The browser
   restricts the URL to the configured storage origin and does not retain it.
   Issuing or downloading a file never records a human review or verifies it.
5. `/passports?item=<item UUID>` displays current effective model/item values,
   supports text, numeric, boolean and structured input, evidence links,
   authorised evidence verification and separate value validation. Zero and
   false remain explicit values; blank input does not become a measurement.
6. `/models` requires an explicit applicability review for each current
   conditional point, with a decision and source/reason. Missing or inconsistent
   decisions block publication; unknown is never treated as not applicable.
   The server records actor/time, locks and invalidates affected batteries, and
   audits the review. Complete validation uses the same current evidence/provenance, cross-field
   and lifecycle assessment as publication. A 100% completeness score can still
   be blocked. Read-only assessments do not mutate passport state or reveal raw
   values/evidence metadata. The existing publication transaction rechecks
   current data and retains locking, immutable versions, audit and hash chaining.
   Existing models lacking authenticated review metadata remain blocked until
   reviewed; this does not rewrite their already published versions/snapshots.
7. Publication requires an explicit operator confirmation. The console shows
   published versions and an authenticated SVG QR download. The BFF admits
   only the exact UUID QR path on GET/HEAD, with bounded bytes, a fixed download
   name and restrictive SVG policy. It retains the existing session, tenant,
   trusted host and origin controls. Other file paths and QR mutations fail.

Private review links last at most 60 seconds and cannot outlive the document's
validity. Revocation prevents further issuance; an already issued link remains
a capability until its short expiry. Downloads use an attachment disposition
and octet-stream rather than rendering untrusted documents inline, with private
no-store response headers. Running downloads and files already downloaded cannot
be recalled. An issuance
audit proves issuance, not that a reviewer opened or understood the source.

## Public scan route

`/b/<public UUID>` is an anonymous human-readable viewer. Its server fetches
only `/v1/public/b/<UUID>` from the configured API origin, with no browser
credentials, no cache or redirects and a bounded response. It reprojects fields
using the rule catalogue, not incoming access-tier labels, and strips internal
metadata. Restricted fields, evidence links and canonical data are not rendered.
Missing snapshots and upstream errors show no fabricated or stale passport.

For new issuance, configure `RESOLVER_BASE_URL` to the chosen HTTPS viewer
origin plus `/b`, e.g. `https://app.eubatterypassport.nl/b`. The console/public
viewer must actually be deployed at that origin before issuing physical labels.
The updated deployment example and generated acceptance proposal prepare this
route; they do not configure DNS or create a service. A future separate resolver
domain must route to this viewer. Existing published UPI URLs are immutable:
retain or redirect their old resolver routes rather than rewriting versions.

## Validation and remaining release work

Regression coverage exercises current usable evidence, completeness versus
publishability, truthful supplier delivery, protected QR transport and public
projection. Browser fixtures cover creation and persistence through real
cookie/BFF/tenant APIs, blocked incomplete publication, review/publication/QR UI
sequencing, mobile/desktop public scans, XSS and unavailable-data handling.
Synthetic UI/public API fixtures test rendering and sequencing; they are not
evidence of real Auth0, storage or EU Registry acceptance. Required CI retains
PostgreSQL/MinIO/ClamAV, upgrade and restore fixtures plus security scans.

The real target environment remains unaccepted: provider login/MFA/recovery,
EU storage and scanner acceptance, ingress/alerts, independent recovery and
security review, contracts and licensed identifier/data-carrier profiles still
need the existing Gate 7 runbook. An independent customer export/archive and
successor drill are separate continuity work. Paid infrastructure remains
deferred under the owner's prior instruction. Both Registry flags stay false;
the current official battery submission facilities remain unavailable.

## How competitors already operate

The Commission distinguishes making/updating a passport from registration.
Passport data remains with the responsible operator or its authorised provider.
Volvo confirms EX90 passport access through its app and QR. Circulor itself
reported on 23 September that the Registry was live but passports could not yet
be registered. The Commission's linked v1.03 guide still identifies the missing
battery semantic catalogue. Working passport delivery therefore does not prove
successful EU Registry registration.

- [Commission FAQ](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/eu-digital-product-passport-faq-batteries_en)
- [Commission Registry guide](https://single-market-economy.ec.europa.eu/document/download/079a45e2-469f-4eec-b1e5-32e8e05d1357_en?filename=dpp_registry_user_guide_for_economic_operators.pdf)
- [Volvo battery information](https://www.volvocars.com/us/cars/electrification/battery/)
- [Circulor Registry update](https://circulor.com/articles/eu-dpp-registery-live)
