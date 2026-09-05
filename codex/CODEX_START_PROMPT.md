# Codex start instruction

Work from the repository root and read `AGENTS.md` and `CODEX_HANDOFF.md` before touching code.

Follow the current status in `CODEX_HANDOFF.md` and execute `codex/NEXT_TASKS.md` in order. Gates 1–4 have verification reports; retain their clean-install, schema, build, tenant-isolation, disclosure and real MinIO/browser evidence checks. The next implementation gate is Gate 5: the complete passport lifecycle, immutable version hashes and lifecycle transitions. Do not skip earlier checks to expand product features.

Do not weaken any truth gate merely to make tests pass. In particular, do not fake EU Registry success, do not auto-validate extracted/supplier data, and do not route canonical/restricted passport data through the public resolver.

The Gate 5 working branch is prepared but not integration-verified. Read
`codex/GATE_5_REPORT.md`; resume its blocked database/MinIO tests, merge/push and CI
steps with appropriate execution and GitHub permissions. Do not interpret the
presence of the implementation or a local WIP commit as a completed gate.
