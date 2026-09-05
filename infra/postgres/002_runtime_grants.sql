-- Apply as cluster/database administrator after migration and 001_rls.sql.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO eubp_runtime, eubp_resolver;
GRANT ALL ON SCHEMA public TO eubp_migrator;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM eubp_runtime, eubp_resolver;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM eubp_runtime, eubp_resolver;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO eubp_runtime', t.relname);
  END LOOP;
END $$;
GRANT SELECT ON "RegulatoryRuleSet", "FieldDefinition" TO eubp_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eubp_runtime;
GRANT SELECT ON "PublicPassportSnapshot", "SupplierRequest", "AccessGrant" TO eubp_resolver;

-- The API can append audit records, but cannot rewrite their history.
REVOKE UPDATE, DELETE ON "AuditEvent" FROM eubp_runtime;
ALTER FUNCTION get_public_passport_snapshot(text) OWNER TO eubp_resolver;
ALTER FUNCTION resolve_supplier_request_token(text) OWNER TO eubp_resolver;
ALTER FUNCTION resolve_access_grant_token(text) OWNER TO eubp_resolver;
REVOKE ALL ON FUNCTION get_public_passport_snapshot(text), resolve_supplier_request_token(text), resolve_access_grant_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_passport_snapshot(text), resolve_supplier_request_token(text), resolve_access_grant_token(text) TO eubp_runtime;
