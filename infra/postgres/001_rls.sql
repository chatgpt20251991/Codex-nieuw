-- EUBatteryPassport tenant isolation policies.
-- Application sets app.current_org_id with set_config inside each transaction.
-- The production DB role MUST NOT have BYPASSRLS or table ownership privileges.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User','BatteryModel','BatteryItem','PassportValue','EvidenceObject','Supplier',
    'SupplierRequest','ComplianceCheck','PassportVersion','RegistrySubmission',
    'AccessGrant','LifecycleEvent','TelemetryReading','AuditEvent','ExtractionJob',
    'IdempotencyRecord','PublicPassportSnapshot','RegistryIdentity','RegistryEnrolmentProfile'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organisationId" = current_setting(''app.current_org_id'', true)) WITH CHECK ("organisationId" = current_setting(''app.current_org_id'', true))',
      t
    );
  END LOOP;
END $$;

-- Relationship tables inherit visibility from every tenant-owned parent.
-- Checking both sides prevents linking a visible value to another tenant's evidence.
DO $$
DECLARE entry record;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('EvidenceLink', 'EXISTS (SELECT 1 FROM "EvidenceObject" e WHERE e.id = "evidenceId") AND EXISTS (SELECT 1 FROM "PassportValue" v WHERE v.id = "passportValueId")'),
    ('ExtractedClaim', 'EXISTS (SELECT 1 FROM "ExtractionJob" j WHERE j.id = "extractionJobId") AND ("passportValueId" IS NULL OR EXISTS (SELECT 1 FROM "PassportValue" v WHERE v.id = "passportValueId"))'),
    ('SupplierContact', 'EXISTS (SELECT 1 FROM "Supplier" s WHERE s.id = "supplierId")'),
    ('SupplierRequestField', 'EXISTS (SELECT 1 FROM "SupplierRequest" r WHERE r.id = "supplierRequestId")'),
    ('SupplierSubmission', 'EXISTS (SELECT 1 FROM "SupplierRequest" r WHERE r.id = "supplierRequestId")'),
    ('SupplierSubmissionEvidence', 'EXISTS (SELECT 1 FROM "SupplierSubmission" s WHERE s.id = "supplierSubmissionId") AND EXISTS (SELECT 1 FROM "EvidenceObject" e WHERE e.id = "evidenceId")')
  ) AS policies(table_name, expression)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', entry.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', entry.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', entry.table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (%s) WITH CHECK (%s)', entry.table_name, entry.expression, entry.expression);
  END LOOP;
END $$;

ALTER TABLE "WrittenAuthorisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WrittenAuthorisation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authorisation_read ON "WrittenAuthorisation";
CREATE POLICY authorisation_read ON "WrittenAuthorisation" FOR SELECT USING (
  "responsibleOperatorId" = current_setting('app.current_org_id', true)
  OR "serviceProviderId" = current_setting('app.current_org_id', true)
);
DROP POLICY IF EXISTS authorisation_write ON "WrittenAuthorisation";
CREATE POLICY authorisation_write ON "WrittenAuthorisation" FOR ALL
USING ("responsibleOperatorId" = current_setting('app.current_org_id', true))
WITH CHECK ("responsibleOperatorId" = current_setting('app.current_org_id', true));

ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organisation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_write ON "Organisation";
CREATE POLICY organisation_write ON "Organisation" FOR ALL
USING (id = current_setting('app.current_org_id', true))
WITH CHECK (id = current_setting('app.current_org_id', true));
DROP POLICY IF EXISTS authorised_counterparty_read ON "Organisation";
CREATE POLICY authorised_counterparty_read ON "Organisation" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "WrittenAuthorisation" a WHERE
    a."revokedAt" IS NULL AND a."validFrom" <= CURRENT_TIMESTAMP
    AND (a."validUntil" IS NULL OR a."validUntil" > CURRENT_TIMESTAMP)
    AND ((a."responsibleOperatorId" = "Organisation".id AND a."serviceProviderId" = current_setting('app.current_org_id', true))
      OR (a."serviceProviderId" = "Organisation".id AND a."responsibleOperatorId" = current_setting('app.current_org_id', true))))
);

-- The non-login resolver may read only these three projection/context tables.
-- FORCE RLS still applies to its SECURITY DEFINER functions.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['PublicPassportSnapshot', 'SupplierRequest', 'AccessGrant'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS resolver_read ON %I', t);
    EXECUTE format('CREATE POLICY resolver_read ON %I FOR SELECT TO eubp_resolver USING (true)', t);
  END LOOP;
END $$;

-- Public snapshots are intentionally accessed through a separate database role in production.
-- Do NOT grant that public role SELECT on PassportVersion, PassportValue or EvidenceObject.

-- Read-only public projection. Own this function with a tightly controlled migration role.
-- It returns ONLY the already-filtered PublicPassportSnapshot.publicJson document.
CREATE OR REPLACE FUNCTION get_public_passport_snapshot(p_public_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT "publicJson"
  FROM "PublicPassportSnapshot"
  WHERE "publicId" = p_public_id
    AND active = true
  ORDER BY "publishedAt" DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_public_passport_snapshot(text) FROM PUBLIC;
-- Deployment must GRANT EXECUTE on this function to the runtime API role.

-- Capability-token resolvers return only the minimum tenant context needed to enter an RLS transaction.
CREATE OR REPLACE FUNCTION resolve_supplier_request_token(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'organisationId', "organisationId",
    'expiresAt', "expiresAt",
    'status', status
  )
  FROM "SupplierRequest"
  WHERE "tokenHash" = p_token_hash
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_supplier_request_token(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION resolve_access_grant_token(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'organisationId', "organisationId",
    'batteryItemId', "batteryItemId",
    'accessTier', "accessTier",
    'purpose', purpose,
    'validFrom', "validFrom",
    'validUntil', "validUntil",
    'revokedAt', "revokedAt"
  )
  FROM "AccessGrant"
  WHERE "tokenHash" = p_token_hash
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_access_grant_token(text) FROM PUBLIC;
