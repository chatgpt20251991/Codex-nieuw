# Codex start instruction

Work from the repository root and read `AGENTS.md` and `CODEX_HANDOFF.md` before touching code.

Follow the current status in `CODEX_HANDOFF.md` and execute `codex/NEXT_TASKS.md` in order. Gates 1–3 have verification reports; retain their clean-install, schema, build, tenant-isolation and disclosure checks. The next implementation gate is Gate 4: real MinIO uploads, byte-integrity failures and evidence provenance. Do not skip those checks to expand product features.

Do not weaken any truth gate merely to make tests pass. In particular, do not fake EU Registry success, do not auto-validate extracted/supplier data, and do not route canonical/restricted passport data through the public resolver.
