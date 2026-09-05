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
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organisationId" = current_setting(''app.current_org_id'', true)) WITH CHECK ("organisationId" = current_setting(''app.current_org_id'', true))',
      t
    );
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
SET search_path = public
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
SET search_path = public
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
SET search_path = public
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
