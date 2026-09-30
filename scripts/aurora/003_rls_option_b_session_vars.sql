-- REVIEW BEFORE RUNNING. Not executed by the app.
-- Option B: keep RLS as defense in depth, driven by a per-transaction session variable
-- instead of Supabase's auth.uid(). Only choose this if security review requires row-level
-- enforcement inside the database. It also needs an app change: each request must run
--   SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)
-- inside the same transaction as its queries.
--
-- Pattern shown for `assessments`; repeat per table once the ownership column is confirmed.
-- RLS only applies to non-owner roles, so the app must connect as the role from 004_app_user.sql.

BEGIN;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY INVOKER
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY INVOKER
  AS $$ SELECT coalesce(current_setting('app.user_role', true), '') = 'ADMIN' $$;

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assessments_owner_or_admin ON assessments;
CREATE POLICY assessments_owner_or_admin ON assessments
  FOR ALL TO smartfmv_app
  USING (app_is_admin() OR created_by = app_current_user_id())
  WITH CHECK (app_is_admin() OR created_by = app_current_user_id());

-- Benchmark and rule tables: everyone reads, only admins write.
ALTER TABLE benchmark_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS benchmark_files_read ON benchmark_files;
DROP POLICY IF EXISTS benchmark_files_admin_write ON benchmark_files;
CREATE POLICY benchmark_files_read ON benchmark_files FOR SELECT TO smartfmv_app USING (true);
CREATE POLICY benchmark_files_admin_write ON benchmark_files FOR ALL TO smartfmv_app
  USING (app_is_admin()) WITH CHECK (app_is_admin());

COMMIT;
