export const RUNTIME_DATABASE_SECURITY_ERROR = 'Runtime database security requirements are not satisfied.';

type CatalogClient = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

/**
 * PostgreSQL 16+ startup check against the committed public-schema RLS pack.
 * This is a read-only snapshot of privileges and policy structure. It cannot
 * establish exact policy semantics, future privilege changes or restore safety;
 * the real tenant-isolation and target-environment acceptance tests remain required.
 */
export async function assertRuntimeDatabaseSecurity(client: CatalogClient): Promise<void> {
  try {
    const result = await client.$queryRaw`
      WITH set_roles AS (
        SELECT r.oid
        FROM pg_catalog.pg_roles r
        WHERE r.rolname = CURRENT_USER
          OR pg_catalog.pg_has_role(CURRENT_USER, r.oid, 'SET')
      ), effective_roles AS (
        -- Include SET ROLE followed by inheritance, not just direct memberships.
        SELECT r.* FROM pg_catalog.pg_roles r
        WHERE EXISTS (
          SELECT 1 FROM set_roles s
          WHERE s.oid = r.oid OR pg_catalog.pg_has_role(s.oid, r.oid, 'USAGE')
        )
      ), tenant_tables(table_name) AS (
        VALUES ('User'), ('BatteryModel'), ('BatteryItem'), ('PassportValue'),
          ('EvidenceObject'), ('Supplier'), ('SupplierRequest'), ('ComplianceCheck'),
          ('PassportVersion'), ('RegistrySubmission'), ('AccessGrant'), ('LifecycleEvent'),
          ('TelemetryReading'), ('AuditEvent'), ('ExtractionJob'), ('IdempotencyRecord'),
          ('PublicPassportSnapshot'), ('RegistryIdentity'), ('RegistryEnrolmentProfile'),
          ('EvidenceLink'), ('ExtractedClaim'), ('SupplierContact'), ('SupplierRequestField'),
          ('SupplierSubmission'), ('SupplierSubmissionEvidence'), ('WrittenAuthorisation'), ('Organisation')
      ), required_policies(table_name, policy_name, command, resolver_only) AS (
        SELECT table_name, 'tenant_isolation', '*', false FROM tenant_tables
        WHERE table_name NOT IN ('WrittenAuthorisation', 'Organisation')
        UNION ALL VALUES
          ('WrittenAuthorisation', 'authorisation_read', 'r', false),
          ('WrittenAuthorisation', 'authorisation_write', '*', false),
          ('Organisation', 'organisation_write', '*', false),
          ('Organisation', 'authorised_counterparty_read', 'r', false),
          ('PublicPassportSnapshot', 'resolver_read', 'r', true),
          ('SupplierRequest', 'resolver_read', 'r', true),
          ('AccessGrant', 'resolver_read', 'r', true)
      ), app_namespace AS (
        SELECT oid, nspowner FROM pg_catalog.pg_namespace WHERE nspname = 'public'
      ), app_relations AS (
        SELECT c.* FROM pg_catalog.pg_class c JOIN app_namespace n ON n.oid = c.relnamespace
      )
      SELECT (
        CURRENT_USER = SESSION_USER
        AND pg_catalog.current_schema() = 'public'
        AND pg_catalog.current_setting('row_security') = 'on'
        AND (SELECT count(*) = 1 FROM app_namespace)
        AND EXISTS (SELECT 1 FROM effective_roles)
        AND NOT EXISTS (
          SELECT 1 FROM effective_roles r
          WHERE r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
            -- Predefined cluster-wide roles are unnecessary for the application.
            OR pg_catalog.left(r.rolname::text, 3) = 'pg_'
        )
        AND NOT EXISTS (
          -- ADMIN OPTION could turn a currently non-assumable grant into access.
          SELECT 1 FROM pg_catalog.pg_auth_members m
          JOIN effective_roles r ON r.oid = m.member WHERE m.admin_option
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_database d CROSS JOIN effective_roles r
          WHERE d.datname = pg_catalog.current_database()
            AND (d.datdba = r.oid OR pg_catalog.has_database_privilege(r.oid, d.oid, 'CREATE'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_namespace n CROSS JOIN effective_roles r
          WHERE n.nspowner = r.oid OR pg_catalog.has_schema_privilege(r.oid, n.oid, 'CREATE')
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_relations c JOIN effective_roles r ON r.oid = c.relowner
        )
        AND NOT EXISTS (
          -- Resolver function ownership is privileged even though its role has no BYPASSRLS.
          SELECT 1 FROM pg_catalog.pg_proc p JOIN app_namespace n ON n.oid = p.pronamespace
          JOIN effective_roles r ON r.oid = p.proowner
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_relations c CROSS JOIN effective_roles r
          WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE,TRIGGER')
        )
        AND NOT EXISTS (
          SELECT 1 FROM tenant_tables t LEFT JOIN app_relations c ON c.relname = t.table_name
          WHERE c.oid IS NULL OR c.relkind NOT IN ('r', 'p') OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
        )
        AND NOT EXISTS (
          SELECT 1 FROM required_policies expected
          LEFT JOIN app_relations c ON c.relname = expected.table_name
          LEFT JOIN pg_catalog.pg_policy p ON p.polrelid = c.oid AND p.polname = expected.policy_name
          WHERE p.oid IS NULL OR p.polcmd::text <> expected.command OR NOT p.polpermissive
            OR p.polqual IS NULL OR (expected.command = '*' AND p.polwithcheck IS NULL)
            OR p.polroles IS DISTINCT FROM CASE WHEN expected.resolver_only
              THEN ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'eubp_resolver')]
              ELSE ARRAY[0::oid] END
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_policy p JOIN app_relations c ON c.oid = p.polrelid
          JOIN tenant_tables t ON t.table_name = c.relname
          WHERE NOT EXISTS (
            SELECT 1 FROM required_policies expected
            WHERE expected.table_name = c.relname AND expected.policy_name = p.polname
          )
        )
      ) AS safe
    `;
    if (!Array.isArray(result) || result.length !== 1 || result[0]?.safe !== true) {
      throw new Error(RUNTIME_DATABASE_SECURITY_ERROR);
    }
  } catch {
    // Connection URLs, role names and database/driver diagnostics never escape.
    throw new Error(RUNTIME_DATABASE_SECURITY_ERROR);
  }
}
