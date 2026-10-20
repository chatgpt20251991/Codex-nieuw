# Website updates through GitHub

The public website source lives in `websites/marketing` in
`chatgpt20251991/Codex-nieuw`. This is a standalone Vinext project with its own
lockfile; it is intentionally outside the platform's npm workspaces.

## Edit and check

Use a branch and pull request. From this directory, with Node 22.13 or newer
and npm 10.9.8 (the declared packageManager, also pinned in CI):

```sh
npm run install:ci
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test test/*.test.mjs
npm run build
```

The `marketing-site` GitHub Actions workflow runs those checks and a separate
website dependency audit/SBOM. It also checks the Sites output contract and
retains the build for seven days. Existing platform/security checks still run.
No production secrets are needed for these checks.

The 9 October dependency review patches `sharp` 0.35.4 to 0.35.5 and
`source-map-js` 1.2.1 to 1.2.2. The exact `sharp` patch override is needed because
the existing Miniflare release pins the vulnerable patch; the framework and
provider-tool versions are unchanged. See the primary
[sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) and
[source-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

The full lockfile audit still reports eight high affected dependency entries
from one unresolved [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
published 18 September and updated 2 October 2026. All published braces versions
through 3.0.3 are affected; the primary advisory lists no patched version.
Both development-tool chains reach it: `eslint-config-next` →
`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`, and
`vinext` → `vite-plugin-commonjs` → `vite-plugin-dynamic-import` → `fast-glob` →
`micromatch` → `braces`. These packages are marked development dependencies in
the lockfile; that does not waive the existing security gate. The reviewed
newest upstream micromatch, fast-glob and Vinext releases retain this chain.

Four moderate affected entries remain from one
[esbuild development-server advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
in `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` →
`esbuild` 0.18.20. The compatible loader range has no fixed esbuild patch.
Do not downgrade the migration tool to the incompatible version suggested by
an automatic force fix. No advisory is ignored and the high/critical failure
threshold is unchanged. Passing functional tests does not clear these findings;
the unresolved high advisory remains a publication blocker.
The separate production-only audit reports zero known findings on this date;
the required full audit still includes the development/build dependencies.

## Publish the reviewed revision

GitHub is the source of truth for website edits. GitHub Actions currently
**validates and builds; it does not publish to Sites automatically**. The
available Sites connector has no GitHub webhook or persistent deployment
credential. Do not put an expiring Sites source token into GitHub secrets or
pretend a passing build changed the live website.

After merging a reviewed revision, ask the Site-owning Codex task to publish
`websites/marketing` from that exact GitHub commit. The task must:

1. Fetch the reviewed revision and verify a clean working tree.
2. Reuse the existing standalone Sites checkout and its hosting project.
   Synchronize only the tracked website files from that revision, removing
   obsolete tracked website files after inspecting the diff. Preserve the
   standalone `.git`, ignored local settings, and hosted environment secrets.
   Do not overwrite uncommitted work or copy the platform root into the Site.
3. Build and run the website checks in that standalone checkout.
4. Follow the Sites hosting skill: commit and push the exact website source to
   the existing Sites source remote using a short-lived per-command credential,
   package that same revision, save it and deploy it to the site's current
   public audience. Record both the GitHub revision and Sites source revision
   in the release note outside the website checkout.
5. Verify deployment success and the public URL. Keep the same project ID and
   domain assignments. Never create a second Site for an update.

The imported starting source is the already-published Sites revision
`a3de4b43d0bd6ca0e0cfd15a67578792368ab30c`.
The live Site is https://eubatterypassport.ll33555555.chatgpt.site.
The requested custom domains are `eubatterypassport.nl` and
`www.eubatterypassport.nl`; provider validation must be checked independently.

## Operational boundaries

This is the marketing website, separate from the regulated platform.
`INTAKE_ENABLED` must remain false until the mailbox and a tested processing
path work. This import does not activate intake or email. Hosting runtime
values are managed through Sites, never committed. Preserve the approved
design, Start online intake CTA, and the existing compliance/security gates.
