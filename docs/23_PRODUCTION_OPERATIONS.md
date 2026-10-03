# Production installation and acceptance

This runbook turns the existing API and customer console into a reproducible deployment package. It does not record a customer launch. The marketing site is already published separately. The platform still needs approved hosting, real secrets, MFA, storage, recovery and independent security acceptance. The EU Registry flags remain false.

## Current status on 3 October 2026

PR 17 now includes current main and has passed all 13 returned GitHub checks on `dc6c5fc`; it was merged at `9f639425e383693c8a75f45dc36c0303dad0d33f`. The API therefore refuses production startup with excessive database privileges or missing tenant isolation. Local verification passed typecheck, 80 unit tests and 43 source checks. Real PostgreSQL integration remains recorded in GitHub Actions, not a local production instance.

The earlier Auth0 staging tenant and Action exist according to the 6 September account inspection. That inspection also found MFA disabled and no callback URLs. Those settings have not been reverified or changed in this work. The owner has been asked to confirm the available Render workspace before service discovery. No paid resources have been ordered and no live credentials have been obtained.

The provided KvK details identify Avenzo digital, 94554692, as a sole proprietorship. This is owner-supplied information, not a completed Registry verification. The KVK activity/name change and owner's identification remain separate from deploying software.

## Deployment package

Build from the repository root with `infra/deployment/Dockerfile`. Supply only the two public addresses as build arguments. Never pass Auth0, database, storage or session secrets to the image build. The allowlisted build context excludes `.env` files, local outputs, Git history and the separate marketing site. The official Node 22 base image is digest-pinned. The runtime runs as the unprivileged `node` user.

```sh
docker build -f infra/deployment/Dockerfile -t eubp-platform:<reviewed-revision> \
  --build-arg NEXT_PUBLIC_API_URL=https://api.eubatterypassport.nl/v1 \
  --build-arg NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN=https://<approved-bucket-host> .
```

The proposed addresses must be replaced by real, controlled HTTPS addresses before building. Record the resulting image digest and revision. A build does not migrate a database or contact Auth0. CI builds the image using reserved example origins and checks its non-root identity, installed runtime modules and rejection of missing startup configuration. Those image checks are packaging evidence, not real login evidence.

Use the same image for two separately configured services:

| Service | Command | Runtime configuration |
| --- | --- | --- |
| API | `node scripts/ops/start-service.cjs api` | `infra/deployment/api.env.example` |
| Customer console | `node scripts/ops/start-service.cjs web` | `infra/deployment/web.env.example` |

The console validates the existing Auth0 configuration rules before listening. It rejects public origins that differ from the built assets. API startup runs the existing authentication/scanner settings check and the connected database privilege inspection. Neither startup command performs migrations. Both use the provider's `PORT`; the console preserves the configured public host as described in `docs/22_AUTH0_SETUP.md`.

Do not give either service administrator or migration database credentials. Provision separate PostgreSQL 16+ runtime and migrator roles through an approved administrative session, apply the committed migrations as migrator and then the RLS/grant pack as administrator. Never apply `infra/postgres/000_roles.sql` to production: it contains fixed local test passwords. Database TLS must verify the server certificate. Configure the trusted CA using the provider's documented mechanism; do not use `accept_invalid_certs` to pass inspection.

## Hosting decision

Render supports this Git-backed Docker monorepo setup. Use EU-region services and PostgreSQL, plus a private scanner with maintained signatures and separate private EU object storage. Select the region, instance sizes, backup coverage and total cost only after inspecting the existing account and obtaining approval for new charges. No `render.yaml` with paid resources is auto-applied by this package. Render's free options are not claimed to meet the availability and recovery requirements for customer evidence.

Provider references: [Docker](https://render.com/docs/docker), [monorepos](https://render.com/docs/monorepo-support), [compute plans](https://render.com/docs/compute-plans). The existing `/v1/health` route is a process liveness check, not proof of database, scanner or storage readiness. Keep customer admission closed until the checks below and the target-environment acceptance are complete.

## Inspect real infrastructure without changing it

Run the command inside a controlled administrative environment with the approved API runtime configuration. It outputs fixed check names and pass/fail only. Do not print environment variables or driver errors to diagnose failures.

```sh
node scripts/ops/production-preflight.cjs
```

The initial storage profile is AWS S3 in an EU member-state region with a customer-managed KMS key, enabled versioning, bucket public-access blocking, a non-public bucket policy, Object Lock/default retention and exact browser CORS origins. The checker rejects custom S3 endpoints rather than pretending that AWS controls prove another provider's controls. Another provider requires a reviewed equivalent acceptance profile. A detected positive retention period is not approval that it meets contractual or legal requirements.

Use dedicated read-only AWS inspection credentials through the standard AWS credential chain or `PROBE_S3_ACCESS_KEY`, `PROBE_S3_SECRET_KEY` and optional `PROBE_S3_SESSION_TOKEN`. Do not broaden the API's S3 role merely to run this inspector. Inspection requires bucket location, versioning, public-access-block, policy-status, encryption, Object Lock and CORS read permissions; it performs no object download/upload or configuration mutation.

The database probe uses the restricted runtime connection with a read-only transaction and timeout. The OIDC probe reads public discovery and keys, rejects redirects, bounds response size and checks the configured issuer/endpoints. It does not authenticate a user or prove MFA. The scanner probe uses private ClamAV VERSION/PING and rejects signatures older than 48 hours or implausibly future-dated. Configure scanner `TZ=UTC`, because VERSION omits its timezone. It does not transmit EICAR or any customer document.

Exit 0 means the five technical inspections passed. The report always retains `customerLaunchApproved: false` and `registryRegistrationVerified: false`. Exit 1 means an inspection failed or could not complete. Missing access is a failed inspection, not a passed or skipped control. The production application continues to enforce evidence integrity and malware gates independently of this inspector.

## Complete acceptance before customer access

Retain dated evidence tied to the deployed commit, image digest and configuration revision for every item below. Never put secrets, access tokens, identity documents or customer files into the public repository.

1. Auth0: production tenant and terms, active MFA/recovery, verified test identities, approved organisation/role mappings, actual browser login/logout and rejected cross-tenant access. The user's personal authentication and MFA enrolment require their participation.
2. Evidence: real private bucket/KMS permissions, Object Lock policy approved by the owner, exact browser upload, checksum mismatch, clean/EICAR/timeout handling and restricted/public disclosure.
3. Operations: gateway/WAF and shared limits, private scanner access, signature updates, redacted logs, delivered and acknowledged test alerts, named incident owner.
4. Recovery: encrypted database and object-version backup; restore to a separate approved destination; recover keys and roles; measure RPO/RTO; verify hash chains, RLS and evidence bytes. Do not restore over the live database.
5. Security: independent scoped penetration test and container/host vulnerability review, with blocking findings resolved and retested. Repository tests are not independent certification.
6. Customer onboarding: approved controller details, processing agreement, written authorisation, retention/exit arrangements and access revocation procedure. Supplier invitation mail still needs a transactional delivery integration; the marketing mailbox worker does not provide that function.

Use `docs/21_PRODUCTION_SECURITY_RUNBOOK.md` for the complete test scenarios and `docs/19_BACKUP_RESTORE_DRILL.md` for the existing isolated recovery fixture. Mark each external item complete only after actual evidence exists. The first paid customer should initially receive a bounded dossier assessment while the production acceptance remains open.
