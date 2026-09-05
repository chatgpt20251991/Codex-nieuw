# Security Threat Model — V2

| Threat | Primary control | Remaining work |
|---|---|---|
| Cross-tenant IDOR | auth-derived tenant + RLS | integration tests with non-owner runtime DB role |
| Malicious acting-org header | WrittenAuthorisation lookup | authorisation scope enforcement beyond tenant-level |
| Public restricted-data leak | separate PublicPassportSnapshot | automated E2E leakage regression suite |
| Stolen supplier link | 256-bit token, hash-at-rest, expiry, fragment URL | one-time use option, IP/risk signals |
| Stolen restricted link | expiring scoped token | revocation UI, stronger identity for sensitive audiences |
| Fake evidence file/hash | S3 checksum + byte hash finalisation | malware scanning, file parser sandbox |
| LLM hallucinated evidence value | extractor claims stay suggested | reviewer UX + confidence/provenance contract |
| Audit tampering | append-only app semantics + hashes | WORM/export to independent audit sink |
| Fake Registry success | state-machine + disabled adapter | official sandbox/live contract tests |
| Identifier takeover/domain loss | stable resolver architecture | registrar lock, DNSSEC, domain continuity escrow |
| Service-provider shutdown | exportable decentralised data model | tested successor-provider/wind-down plan |
| Database credential compromise | RLS and least-privileged role | secret rotation, network segmentation, DB audit |
| Supply-chain package attack | none sufficient yet | lockfile, SBOM, SCA, provenance/signing |

## Production blockers
Malware scanning, dependency lock/SBOM, separate DB roles, E2E RLS tests, OIDC integration, backup restore testing and pen testing are launch gates, not optional polish.

## Added 2026-09-05 — Registry identity threats
| Threat | Control added |
|---|---|
| Service provider impersonates responsible EO | Separate RegistryIdentity actor types; delegated path requires value-chain-actor identity + written authorisation |
| Expired EU Registry verification reused indefinitely | Rule gate requires verifiedAt and caps verification lifetime at three years; earlier electronic-ID expiry can shorten it |
| Customer self-marks Registry verified | No ordinary customer endpoint can create EU Registry success; verification state must be populated only from an externally verified/admin-controlled flow |
| QSeal organisation data mismatch | Registry enrolment profile stores the exact legal name/country/identifier and reserves certificate subject attributes for explicit match checks |
