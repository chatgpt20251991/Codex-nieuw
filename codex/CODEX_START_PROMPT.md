# Codex start instruction

Work from the repository root and read `AGENTS.md` and `CODEX_HANDOFF.md` before touching code.

Follow the current status in `CODEX_HANDOFF.md` and execute `codex/NEXT_TASKS.md` in order. Gates 1–5 have verification reports; retain their clean-install, schema, build, tenant-isolation, disclosure, real MinIO/browser evidence, lifecycle and migration-upgrade checks. The next implementation gate is Gate 6: the Registry adapter contract with live submission disabled. Do not skip earlier checks to expand product features.

Do not weaken any truth gate merely to make tests pass. In particular, do not fake EU Registry success, do not auto-validate extracted/supplier data, and do not route canonical/restricted passport data through the public resolver.

Read `codex/GATE_5_REPORT.md` and inspect PR #13 before starting Gate 6. Gate 5
passed 48 integration tests and the migration-upgrade check in GitHub Actions;
verify the PR's latest checks and merge status. Its rollout requires a write pause,
migrations and reapplication of the runtime grant pack. Do not rewrite historical
snapshots or enable either live Registry flag on the basis of these tests.
