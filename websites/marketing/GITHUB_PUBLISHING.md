# Website updates through GitHub

The public website source lives in `websites/marketing` in
`chatgpt20251991/Codex-nieuw`. This is a standalone Vinext project with its own
lockfile; it is intentionally outside the platform's npm workspaces.

## Edit and check

Use a branch and pull request. From this directory, with Node 22.13 or newer:

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

The September 18 dependency refresh clears the audit's high and critical
findings. Four moderate development-tool findings remain in drizzle-kit's
legacy esbuild loader chain. They stay visible in the audit artifact; the
high/critical failure threshold is not suppressed. Do not downgrade the
migration tool to the incompatible version suggested by an automatic force fix.

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
