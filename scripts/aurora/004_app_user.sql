-- REVIEW BEFORE RUNNING. Not executed by the app.
-- Least-privilege login for the application, replacing the admin account (POSDBADM).
-- Run as the admin user. Set the password in Secrets Manager, never in this file.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartfmv_app') THEN
    CREATE ROLE smartfmv_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

-- The password is set separately, e.g. from a DBA session:
--   \password smartfmv_app

GRANT CONNECT ON DATABASE current_database_name_here TO smartfmv_app;  -- replace with DB_NAME
GRANT USAGE ON SCHEMA public TO smartfmv_app;

-- Data only: no DDL, no TRUNCATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartfmv_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartfmv_app;

-- Tables created later by the admin user get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smartfmv_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO smartfmv_app;

-- Audit history is append-only for the app.
REVOKE UPDATE, DELETE ON assessment_audit_log FROM smartfmv_app;

COMMIT;

-- Then set DB_USER=smartfmv_app and point DB_SECRET_ARN (or DB_PASSWORD locally) at its password.
