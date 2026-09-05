# Gate 4 — Evidence integrity E2E

Gate 3 was reviewed and merged as PR #11, merge `55463434abc3635bb4f7219f178e2a80f1d24d0c`.
This gate runs against real PostgreSQL, the built Nest API, private MinIO storage
and a browser. It adds no schema migration and enables no Registry integration.

## Findings and repairs

- The old presigner hoisted checksum and metadata into query parameters while the
  browser also sent those values as headers. Real MinIO rejected PUT with HTTP
  400 (unsigned headers). Both headers now remain signed headers, alongside the
  content type; the browser sends the API's required headers unchanged.
- Upload sessions used a shared unique `pending` object key before assigning the
  real key. Concurrent sessions could collide. Each session now allocates its UUID
  and final tenant-scoped key before its first insert.
- Operator and supplier upload paths now share integrity checks. Finalization
  checks actual object size and streams SHA-256 over its bytes; HEAD/GET are bound
  by ETag/If-Match. User metadata cannot substitute for a content hash. Missing or
  changed objects return explicit conflicts. Manual verification rechecks bytes.
- Pending, rejected, superseded, expired or future-issued evidence cannot be
  manually verified or extracted. Repeating finalization preserves an existing
  verified decision. State transitions compare the loaded status/timestamp to
  reject a concurrent change and write their audit event in the same transaction.
- Value validation and readiness require linked, verified evidence within its
  validity period. An expired document stops contributing verified readiness even
  when the old passport value still carries a validated status.
- Extraction checks the stored evidence before handing out a short-lived download
  URL. Its job and audit event are created atomically. Even a provider response
  claiming `validated` creates only a `suggested` claim, never a passport value.

## Verification

The 12 new scenarios initially yielded 3 passes and 9 failures against the old
compiled API; some failures cascaded from the rejected browser upload. They are
not nine independent defects. After the repairs, all 34 integration scenarios
passed without skips: 14 tenant/RLS, 8 publication/disclosure and 12 evidence tests.

The browser test creates a real File, hashes it using Web Crypto, requests a signed
URL from the live API, performs a cross-origin PUT into MinIO and finalizes it.
Unsigned object reads are denied. Other scenarios cover corrupt PUT/checksum
headers, forged metadata, absent objects, wrong size, replacement after upload,
repeat finalization, concurrent sessions, supplier ownership/cross-tenant denial,
mandatory-value provenance, expired evidence, extraction and audit actions.

Local environment: Windows, Node 24.15.0, PostgreSQL 16.14, real MinIO and headless
Microsoft Edge controlled by Playwright 1.62.1. CI uses Node 22, PostgreSQL 16,
the pinned MinIO container and Playwright Chromium. The integration command fails
when a required service/browser is unavailable. It does not silently skip Gate 4.
See TEST_REPORT.md for the full build and verification record.

## Fixture and production boundary

The test-only MinIO fixture is `RELEASE.2025-09-07T16-13-09Z`, with Docker manifest
digest `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`.
The native Windows binary was verified against the official SHA-256:
`af709e6ba68488404e85acdd22a3030d0f5e56a108d4b27d744f18ceb50861b4`.

Sources: [official binary/checksum directory](https://dl.min.io/server/minio/release/windows-amd64/),
[Docker tag metadata](https://hub.docker.com/v2/repositories/minio/minio/tags/RELEASE.2025-09-07T16-13-09Z),
and [upstream releases](https://github.com/minio/minio/releases).
The historical prebuilt fixture predates the subsequent source security fix for
STS/service-account policies. It uses synthetic root credentials only, no STS or
service accounts, disposable data and loopback bindings. Do not deploy this fixture
for customers; select and assess supported production storage separately.

These tests cover browser transport, not a complete click-through of Next.js.
The extractor is a local contract fixture, not a reviewed production provider.
The suite does not certify AWS S3/KMS, malware scanning, storage object lock or
versioning, hostile storage administrators, production OIDC or legal compliance.
Existing evidence rows are not automatically upgraded or reverified. Existing
published snapshots remain immutable; new validation uses the stricter evidence
rules. Both Registry feature flags remain false.

Next: Gate 5, covering creation through validation/publication, immutable v1/v2
hashes, prior-passport links for repurpose/remanufacture and recycling closure.
