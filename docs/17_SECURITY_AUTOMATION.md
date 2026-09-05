# Gate 7 security automation

Status: implemented for review on 5 September 2026. Execution evidence belongs in
the Gate 7 report and the current revision's GitHub Actions checks. Adding this
workflow does not establish production readiness or configure a customer identity
provider, storage provider, WAF, incident response or deployment.

## Required checks and evidence

`.github/workflows/security.yml` runs on pushes, pull requests, manual dispatch and
weekly on Monday at 06:17 UTC after merge to the default branch. It uses GitHub's
temporary hosted runners and does not receive deployment or customer secrets.

| Check | Scope | Failure rule | Retained evidence |
|---|---|---|---|
| Dependency audit and SBOM | Clean lockfile install, all workspaces, development and production npm dependencies | Install or audit failure; npm advisories of high or critical severity | Complete CycloneDX lockfile SBOM, npm audit JSON, Node/npm versions |
| Secret scan of complete Git history | All commits fetched with full history, using Gitleaks' bundled rules and ignoring inline `gitleaks:allow` comments | Any finding or scanner/download/checksum error | Redacted JSON findings and scanner version |
| CodeQL (javascript-typescript) | JavaScript/TypeScript sources using the security-extended query suite | Failed analysis, missing/malformed SARIF, or any reported finding | SARIF artifact and GitHub code-scanning results |
| CodeQL (actions) | GitHub Actions workflows using the security-extended query suite | Same fail-closed result gate | SARIF artifact and GitHub code-scanning results |

Artifact names include the analyzed revision; retention is 14 days. Download
release evidence into the organisation's approved long-term security records
before that expiry. A successful CodeQL analysis alone does not mean zero alerts:
`scripts/security/check-sarif.cjs` separately rejects findings. Its six unit tests
cover missing results, failed invocations, warning/note/error/suppressed results,
unexpected tools and the actual directory gate.

The SBOM command uses the committed lockfile and includes the four workspaces.
It describes npm dependency declarations, including optional platform packages;
it does not certify a final container or list operating-system packages. The
dedicated audit install disables dependency lifecycle scripts; the main CI job
retains the full installation, build and integration checks. The audit contacts
the configured npm registry with dependency metadata. Gitleaks scans locally on
the runner, and CodeQL stores results in this existing GitHub repository. No
separate commercial scanning service receives the repository. See the official
[npm SBOM](https://docs.npmjs.com/cli/v11/commands/npm-sbom/) and
[npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/) documentation.

## Tool identity and permissions

Every action is pinned to its verified release commit rather than a moving tag:

| Tool | Version | Pinned identity |
|---|---|---|
| GitHub checkout | 7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| GitHub setup-node | 7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| GitHub upload-artifact | 7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| GitHub CodeQL action | 4.37.9 | `cdf488f595d80d6e07e03d4674febd5ab45fa938` |
| Gitleaks Linux x64 archive | 8.30.1 | SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` |

These were resolved from the official release/tag metadata on 5 September 2026:
[checkout](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node](https://github.com/actions/setup-node/releases/tag/v7.0.0),
[upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.1),
[CodeQL](https://github.com/github/codeql-action/releases/tag/v4.37.9), and
[Gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1).
CodeQL uses `tools: linked`, keeping the bundle associated with that action
release (2.26.4). Node stays on the project's Node 22 line; each SBOM artifact
records the exact Node/npm runtime selected for that execution.

The Gitleaks binary is downloaded over HTTPS and its archive must match the
committed checksum before extraction or execution. Its default rules remain
enabled. There is no baseline file or broad ignore list. Reports use full
redaction, which the pinned implementation applies to stored findings as well
as output. See the upstream
[CLI and history-scanning contract](https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md),
[finding redaction](https://github.com/gitleaks/gitleaks/blob/v8.30.1/report/finding.go)
and [detector filtering](https://github.com/gitleaks/gitleaks/blob/v8.30.1/detect/utils.go).

Checkout does not persist credentials. The workflow token defaults to
`contents: read`; only the CodeQL jobs add `actions: read` and
`security-events: write` for analysis/result publication. CodeQL databases are
not uploaded. The workflow uses `pull_request`, never `pull_request_target`.
CodeQL supports this public repository; a future visibility change requires
checking the applicable private-repository licensing and permissions before
assuming the scan remains available. See the official
[CodeQL action contract](https://github.com/github/codeql-action/blob/v4.37.9/README.md)
and [workflow configuration](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options).

## Baseline findings and remediation

The initial read-only audit of the Gate 6 lockfile reported four high, one
moderate and zero critical affected-package entries. These include dependency
chains, so the package count is not a count of distinct vulnerabilities:

| Dependency path at baseline | Finding | Remediation to validate |
|---|---|---|
| Prisma 6.19.3 -> @prisma/config 6.19.3 -> deepmerge-ts 7.1.5 | Recursive-object merge stack exhaustion; three high package entries through the dependency chain | Upgrade or narrowly override deepmerge-ts to a patched release and rerun Prisma generation, schema validation, fresh migrations and upgrade migrations |
| Next 15.5.25 -> postcss 8.4.31 | Source-map file disclosure and CSS stringification issues; postcss high and Next moderate aggregate entries | Upgrade or narrowly override PostCSS to a patched 8.x release and rerun typechecks and the production web build |

The first issue is documented by
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
The PostCSS audit returned
[GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q),
[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849),
[GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) and
[GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93).
Do not use `npm audit fix --force`, omit development packages, lower the audit
threshold or ignore these advisories simply to make the check green. A scoped
override must remain visible in the root manifest and have its compatibility
demonstrated; especially deepmerge-ts 8 is a major-version replacement under
Prisma 6. Current published candidates checked were
[deepmerge-ts 8.0.2](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.2)
and [PostCSS 8.5.28](https://github.com/postcss/postcss/releases/tag/8.5.28).
Record the post-remediation audit and exact tested lockfile in the Gate 7 report.

## Review and operational boundaries

Before merge, all four security check names above and the main CI checks should
be green on the proposed revision. Configuring them as required checks in the
repository's branch rules is an additional administrative task; the workflow
file alone does not prevent someone bypassing a failed check.

For a scanner finding, inspect the location and data flow, fix the defect and
rerun. A proven synthetic-fixture false positive needs a narrowly scoped,
documented correction reviewed as code; never ignore a whole directory, rule,
severity class or repository history. If a real credential is found, rotate it
at its issuer and follow incident response; deleting the current line does not
remove it from history. Do not rewrite shared history automatically.

Passing these checks covers the configured scanners and the advisory data
available at execution time. Container/OS scanning, artifact signing, an external
penetration test, production provider verification, production malware deployment and the
other Gate 7 deployment controls still require separate implementation and
evidence. Both Registry live flags must remain false.
