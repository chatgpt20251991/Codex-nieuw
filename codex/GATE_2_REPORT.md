# Gate 2 — engineering changes

The initial Prisma migration creates all 29 domain models. The migration connection
is separate from the API connection. Integration tests create a fresh, uniquely named
local test database, deploy the migration as eubp_migrator, and exercise the real Nest
HTTP API as eubp_runtime. Only that generated database is dropped afterwards.

## Changes
- All 27 tenant-owned / relationship tables force row-level security. The other two
  domain tables are shared regulatory definitions, with read-only runtime grants.
- Organisation and written-authorisation operations now enter TenantDbService RLS
  transactions, including the service-provider guard and Registry identity checks.
- Evidence and supplier relationship policies check all parents, preventing links
  between another customer's values, documents and submissions.
- Runtime has no table ownership, superuser, BYPASSRLS, role administration or schema
  creation rights. It cannot modify migration history or update/delete audit events.
- Three narrow SECURITY DEFINER functions use a separate non-login, non-BYPASSRLS
  resolver role. That role can read only public snapshots and minimal token context
  tables; it cannot read canonical passport versions, evidence or passport values.
- Only the responsible operator can issue/revoke written authorisations. Verified
  evidence is required; providers cannot re-delegate a customer's authority.
- Expiry/revocation is evaluated on every request. Authorisation mutations and their
  audit events commit together. Existing authorisation scopes remain tenant-level;
  fine-grained action scopes remain a separate production review item.
- Invalid development bearer tokens return 401. Missing and RLS-hidden resources
  return the same 404; Prisma implementation details are not included in responses.
- JSON null remains null through operator/supplier submission and acceptance, with
  unvalidated/submitted status preserved.
- Root .env loading, Windows-compatible administrative scripts, Docker role setup,
  CI integration service and the committed lockfile accompany the code.

## Verification scope
Final result: 14/14 live PostgreSQL/API integration tests passed; see TEST_REPORT.md. The local database is PostgreSQL
16.14, using the Windows binaries supplied by @embedded-postgres/windows-x64
16.14.0-beta.17 ([upstream project](https://github.com/leinelissen/embedded-postgres)). Docker is not
installed on the host, so the equivalent Docker/CI definitions are included and
syntax-checked, but no Docker container or remote GitHub Actions run was performed.

The suite uses fixture documents and prebuilt public snapshots; it does not claim
MinIO upload E2E, complete publish/lifecycle coverage or real Registry registration.
OIDC provider testing, evidence malware scanning, action-level authorisation scopes,
backup/restore, legal/standards review and Gates 3 onward remain release work.
Registry submission flags remain disabled. Inherited regulatory assertions were
not independently re-verified in this engineering pass.