# Render acceptance installation: prepared, not deployed

Account inspection on 4 October 2026 found two unrelated free web services and
one unrelated free PostgreSQL database, all in Oregon. No EUBatteryPassport API,
console, scanner or database was present. Do not repurpose those resources.
The owner confirmed the workspace; creating a paid installation still requires
approval of its actual scope and charges. Auth0 Dashboard required a fresh login.

## Reviewable installation

`scripts/ops/render-blueprint.cjs` generates a Render Blueprint without calling
any cloud API. It requires explicit plans. The plan JSON is a cost proposal,
not purchase consent. Generate the review artifact into a new path:

```sh
node scripts/ops/render-blueprint.cjs infra/deployment/render-plans.example.json .ops/render.acceptance.yaml
```

The reviewed output is committed at `infra/deployment/render.acceptance.yaml`;
it has not been connected to Render. CI reproduces it from the generator. It was
validated locally against Render's current public JSON Schema on 4 October;
account-level Render validation and actual deployment remain pending.

The output is JSON-compatible YAML with a separate Frankfurt acceptance project,
an API, a console, a private ClamAV service with a digest-pinned official image,
and PostgreSQL 16. It uses the existing production Docker build and secret-free
environment templates. Auto-deploy and previews are off; no automatic migration
is configured. This is a controlled installation for acceptance, not approval
to admit customers. Only synthetic test users and documents may enter it until
the production runbook's release checks are completed.

Both builds receive public origin arguments. The console's upload origin is
shared with the API build. Existing startup gates continue to reject missing or
mismatched authentication, origins and excessive database privileges.

The database administrator connection is deliberately **not** connected to the
API. Create restricted runtime/migrator identities through a controlled admin
session, apply migrations and RLS/grants, and set only the runtime URL in Render.
`infra/postgres/000_roles.sql` remains a local fixture, not production setup.

## Base cost proposal, USD/month

| Component | Proposed size | Monthly USD |
| --- | --- | ---: |
| API | Standard, 1 CPU / 2 GB | 25.00 |
| Console | Standard, 1 CPU / 2 GB | 25.00 |
| Private scanner | Pro, 2 CPU / 4 GB | 85.00 |
| PostgreSQL compute | Basic-1gb | 19.00 |
| PostgreSQL storage | 10 GB | 3.00 |
| Scanner signature disk | 5 GB | 1.25 |
| Render base subtotal | | **158.25** |

Prices checked 4 October against [Render pricing](https://render.com/pricing).
This excludes tax, workspace fees, bandwidth/build overages, Auth0 MFA, S3/KMS,
independent backup storage, WAF/gateway, alerts, email and an independent pentest.
It is neither the complete production bill nor a capacity/SLA commitment.
No automatic scaling or workspace upgrade is requested. Reconfirm pricing in
the actual account before application and stop if it differs from approval.

The scanner's 4 GB allocation follows the official
[ClamAV memory guidance](https://docs.clamav.net/manual/Installing/Docker.html).
Free web/database plans cannot replace this private scanner and paid database
recovery. [Render PITR](https://render.com/docs/postgresql-backups) still needs a
real isolated restore and measured RPO/RTO; creating a database is not that test.

## Target configuration still required

1. Obtain cost approval, then import the generated Blueprint using its explicit
   path. Do not place a paid auto-applied Blueprint at the repository root.
2. Verify Auth0 plan entitlement, enabled factors/recovery and production tenant.
   Deploy and bind the updated Post Login Action; it now requires MFA for this
   audience. The console requests interactive login and validates `amr` from the
   SDK-verified ID token before storing a session. No synthetic MFA claim is
   emitted by the Action. Real login, enrolment, cancellation and recovery tests
   remain mandatory. Existing sessions must expire or be explicitly invalidated
   before using this as a cutover guarantee.
3. Set private EU S3/KMS/Object Lock credentials and the exact bucket browser
   origin. These resources are not provisioned by the Render Blueprint. Approve
   retention and processor arrangements before any customer evidence is stored.
4. Establish certificate-verified database transport. Render documents that its
   internal connection uses self-signed certificates and does not support
   verify-full/verify-ca. The application's strict check must not be disabled.
   Evaluate Render's managed external TLS endpoint with a restricted egress IP
   allowlist and validate its chain/hostname, or choose a database with a verified
   private TLS endpoint. The draft starts with external access disabled, so it
   intentionally does not claim a ready connection. See
   [Render database transport](https://render.com/docs/postgresql-creating-connecting).
5. Verify both custom domains and callback/logout settings. Add and test the
   approved WAF/gateway path with origin bypass protection before customer
   admission; Render's public service endpoints alone do not implement this.
   Do not treat API `/v1/health` or console `/` as complete readiness.
6. Complete delivered alerts, encrypted independent backups/restore, invitation
   delivery, customer authorisations and independent security assessment per
   `docs/23_PRODUCTION_OPERATIONS.md`. Registry flags stay false.

The offline generator never submits secrets, creates customers, sends messages,
changes DNS or spends money. The generated manifest is not a go-live record.
