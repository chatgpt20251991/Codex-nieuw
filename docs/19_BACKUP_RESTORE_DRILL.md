# Synthetic PostgreSQL backup and restore drill

This Gate 7 check exercises `pg_dump` and `pg_restore` against the disposable
PostgreSQL 16 integration service. It creates its own source and destination
databases, restores real database bytes and checks the resulting data and access
controls. It does not back up an existing application database.

## How the check runs

The integration runner calls
`test/integration/verify-backup-restore.cjs` with its local `/postgres`
administrator URL after provisioning `infra/postgres/000_roles.sql`. The
`TEST_POSTGRES_CONTAINER` environment variable must contain the existing test
service's Docker container ID. In GitHub Actions, supply
`${{ job.services.postgres.id }}` on the integration step. Docker must already be
available and the service running; this helper does not start containers.

The helper checks that the container is running, that the server and dump/restore
clients use PostgreSQL 16, and that the container and administrator URL report
the same PostgreSQL system identifier. It accepts only a loopback administrator
URL targeting `/postgres` and a hexadecimal container ID. An unavailable or
incorrect fixture fails the check rather than skipping it.

1. Create a generated `eubp_backup_source_<random>` database from `template0` and deploy the
   committed migrations, RLS policies and grants.
2. Insert two explicitly synthetic tenants, their models/items, three immutable
   published-version fixtures including a two-version hash chain, public
   snapshots and audit rows. These are persistence fixtures, not claims of
   validated battery compliance.
3. Stream a PostgreSQL custom-format archive from `pg_dump` in the existing
   service container to a private, temporary local file. Record its SHA-256 and
   size during the check.
4. Create a generated `eubp_backup_restored_<random>` database from `template0` and restore the
   archive with `pg_restore --single-transaction --exit-on-error`.
5. Compare table owners, row counts, all public-schema policy definitions and
   `ENABLE/FORCE ROW LEVEL SECURITY` settings. Compare restored fixture rows,
   canonical payloads, hashes, version links and public snapshots.
6. Connect using the non-owner `eubp_runtime` role. Prove that missing tenant
   context reveals no versions; tenant A cannot read or modify tenant B;
   cross-tenant insertion fails; version and audit mutation grants remain
   denied; and restricted migration objects remain inaccessible.
7. Exercise the restored immutability trigger through administrator updates and
   cascading deletion attempts. Exercise the separately owned public resolver
   and verify that it returns the public projection without restricted values.

No migration, policy or grant repair runs after restoration. Reapplying those
files would hide a backup that failed to retain its database security settings.
Both generated databases and the generated archive directory are removed in
cleanup. Cleanup checks the generated names and paths; it never accepts an
existing application database or caller-supplied archive directory as a deletion
target. A failure exits the integration run unsuccessfully.

Using `template0` avoids inherited local objects in the restore target, following
the [PostgreSQL 16 dump documentation](https://www.postgresql.org/docs/16/app-pgdump.html).

## What this proves

A passing run proves that the committed schema and the exercised synthetic data
can survive a logical PostgreSQL backup and restoration into an empty database,
with the tested owners, grants, RLS policies, immutable versions and public
resolver behavior intact. The archive's SHA-256 is an in-run integrity check;
the temporary archive is not retained as a deliverable or recovery asset.

Cluster roles are provisioned separately and already exist on this disposable
cluster. `pg_dump` does not capture cluster-wide role definitions or passwords.
The check verifies the committed test roles' limited privileges and restores
object ownership and grants against those roles. It does not demonstrate
rebuilding a separate production cluster or recovering its identity and secrets.

## Production work still required

This local CI exercise is not an encrypted EU production backup, an operational
recovery plan or an RPO/RTO attestation. Before launch, select and exercise the
actual production backup and destination environment, including:

- Encrypted backups and transport, controlled EU locations, key recovery,
  independently restricted credentials, retention and deletion procedures.
- PostgreSQL point-in-time recovery/WAL retention and a documented recovery
  point and recovery time target measured with representative production data.
- Evidence-object bytes, object versions, retention/immutability settings,
  malware-scan records and consistency between storage and database backups.
- Reprovisioning roles, database parameters, extensions, application secrets,
  OIDC configuration, resolver domains and service infrastructure.
- Recovery authorization, operational runbooks, monitoring, failed-backup
  alerts, periodic restoration exercises and independent incident review.

The helper's elapsed time is diagnostic data for this small synthetic exercise.
It must not be advertised as a production recovery-time result. Successful
restoration does not authorize deployment or enable live EU Registry submission.
