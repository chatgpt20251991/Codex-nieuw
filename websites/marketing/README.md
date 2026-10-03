# EUBatteryPassport public website

Website source and automated build/security checks are maintained in
`websites/marketing` of the Codex-nieuw GitHub repository. See
[GITHUB_PUBLISHING.md](GITHUB_PUBLISHING.md) for the update and publication flow.

Marketing site based on the user-approved September 2026 design: midnight blue, green accents, physical battery with hanging passport, and end-to-end passport services copy.

## Routes

- `/`: public marketing page.
- `/voorbeeld`: explicitly fictional passport example.
- `/intake`: intake surface, closed unless `INTAKE_ENABLED=true`.
- `/api/intake`: bounded JSON input, D1 persistence, origin checks, idempotency and per-IP throttling.
- `/privacy`: processing information.

## Operational state

The public design and custom domain are active. The existing Vimexx mailbox
`info@eubatterypassport.nl` passed a real inbound/reply roundtrip on 18 September
2026. That evidence does not verify form delivery through the private PHP worker.

Keep intake disabled until private worker configuration, cron, actual delivery,
error notification and company/controller details have been verified. The worker
is implemented under `ops/mail-worker`; production activation remains incomplete.
`RATE_LIMIT_SALT` must be a production secret; preserve it on ordinary deployments.
D1 records are private and contain business contact details. There is no public
listing endpoint. Additional optional scoping answers are stored in the existing
bounded message field as unreviewed customer declarations.

D1 migrations own the schema. Runtime cleanup removes accepted requests older
than 90 days on subsequent enabled submissions; unsent requests are retained.
This is not a scheduled retention guarantee. Arrange operational cleanup before
activation. Hosted storage is not guaranteed EU-only.

The operational battery-passport application remains separately maintained in Codex-nieuw. This marketing site does not enable registration, upload handling or passport issuance in that application.

## Validation

Production Vinext build and TypeScript check; HTTP route and local asset checks. Browser UI QA requires a connected browser. New schema migrations must be inspected before publishing.

## Local commands

Use the portable Sites profile. On this Windows host npm's shell shim failed; invoking the official npm JavaScript entrypoint directly works. Preserve the lockfile.
