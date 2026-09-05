-- Docker initialisation for the local eubp database, before Prisma migrations.
ALTER DATABASE eubp OWNER TO eubp_migrator;
ALTER SCHEMA public OWNER TO eubp_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
