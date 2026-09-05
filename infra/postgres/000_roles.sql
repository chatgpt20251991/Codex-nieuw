-- Local development / isolated integration cluster only. Production supplies secrets separately.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eubp_migrator') THEN
    CREATE ROLE eubp_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      PASSWORD 'eubp_migrator_local';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eubp_runtime') THEN
    CREATE ROLE eubp_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      PASSWORD 'eubp_runtime_local';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eubp_resolver') THEN
    CREATE ROLE eubp_resolver NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
