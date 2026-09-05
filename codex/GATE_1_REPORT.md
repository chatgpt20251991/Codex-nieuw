# Gate 1 — verified 5 September 2026

Imported the supplied EUBatteryPassport_V2_1_CodexReady.zip (SHA-256
84d978ee3ef726dbeba10177d3ca16af6646089840dfea8e3ef437b3a1d05884).
The ZIP contains source files but no original Git history. Local import commit: 31a7c16.

Validation on Windows with Node 24.15.0 / npm 11.12.1:
- npm install completed; package-lock.json records the resolved dependency tree.
- Prisma 6.19.3 client generated; schema validation passed.
- All four workspaces passed type checking.
- Nest API and Next 15.5.25 production builds passed; all 13 generated pages completed.
- All 20 rule-engine tests and all 43 existing source checks passed.

Corrections: internal workspace version mismatch, dependency-first build order,
Windows-incompatible JSON copy command, nullable Prisma JSON in supplier acceptance,
and Python-only static-test invocation. The 43 source checks now run in Node;
source scanning excludes dependency/build output. CI installs from the lockfile with npm ci.

These source checks do not establish live tenant isolation, upload integrity,
OIDC integration or EU Registry connectivity. Gate 2 is tracked separately.
Regulatory claims inherited from the ZIP were not re-verified during this build gate.