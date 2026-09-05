# Codex start instruction

Work from the repository root and read `AGENTS.md` and `CODEX_HANDOFF.md` before touching code.

Follow the current status in `CODEX_HANDOFF.md` and execute `codex/NEXT_TASKS.md` in order. Gates 1–5, Gate 6's internal Registry preparation and Gate 7's repository security controls have verification reports. Retain their clean-install, schema, build, tenant-isolation, disclosure, real MinIO/browser evidence, lifecycle, Registry contract, malware, security scans and upgrade/restore checks. Continue Gate 7 production acceptance: complete and verify the selected Auth0 EU tenant and browser login using `docs/22_AUTH0_SETUP.md`, then the remaining deployment controls. Protocol fixtures do not replace actual provider acceptance. Do not skip earlier checks to expand product features.

Do not weaken any truth gate merely to make tests pass. In particular, do not fake EU Registry success, do not auto-validate extracted/supplier data, and do not route canonical/restricted passport data through the public resolver.

PR #13 is merged. Read `codex/GATE_6_REPORT.md` and inspect PR #14's current
checks and merge status before starting Gate 7. Gate 6 passes 65 integration tests,
32 unit tests and the migration-upgrade check. The JSON/XML contract is explicitly
internal and not uploadable; obtain and verify official templates/semantic assets
before implementing real Registry mapping or response ingestion. Do not enable
either live flag based on internal fixtures. Retain Gate 5's rollout write pause,
migrations and grant-pack reapplication without rewriting historical snapshots.
