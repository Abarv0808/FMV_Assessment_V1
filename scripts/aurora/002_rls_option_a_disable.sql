-- REVIEW BEFORE RUNNING. Not executed by the app.
-- Option A (recommended): drop the copied Supabase policies and disable RLS.
--
-- Why: every copied policy is USING (true) / WITH CHECK (true) for role PUBLIC, so they
-- restrict nothing today. They only made sense behind Supabase's public Data API. On Aurora
-- the database is private and only the server connects, so access control belongs in the
-- API routes (lib/auth/server.ts) plus a least-privilege database role (004_app_user.sql).

BEGIN;

DROP POLICY IF EXISTS "Allow all access to assessment_audit_log" ON assessment_audit_log;
DROP POLICY IF EXISTS "Users can insert audit events" ON audit_events;
DROP POLICY IF EXISTS "Anyone can delete benchmark files" ON benchmark_files;
DROP POLICY IF EXISTS "Anyone can insert benchmark files" ON benchmark_files;
DROP POLICY IF EXISTS "Anyone can update benchmark files" ON benchmark_files;
DROP POLICY IF EXISTS "Anyone can view benchmark files" ON benchmark_files;
DROP POLICY IF EXISTS public_delete ON benchmark_procedures;
DROP POLICY IF EXISTS public_insert ON benchmark_procedures;
DROP POLICY IF EXISTS public_read ON benchmark_procedures;
DROP POLICY IF EXISTS public_update ON benchmark_procedures;
DROP POLICY IF EXISTS "Allow all access to fmv_disambiguation_rules" ON fmv_disambiguation_rules;
DROP POLICY IF EXISTS "Allow all access to fmv_synonym_rules" ON fmv_synonym_rules;
DROP POLICY IF EXISTS "Allow all access to fmv_therapeutic_areas" ON fmv_therapeutic_areas;

ALTER TABLE IF EXISTS assessments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessment_line_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessment_comparisons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessment_benchmark_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessment_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS benchmark_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS benchmark_procedures DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS country_currencies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fmv_disambiguation_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fmv_synonym_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fmv_therapeutic_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify: should return no rows.
-- SELECT relname FROM pg_class
--  WHERE relrowsecurity AND relnamespace = 'public'::regnamespace;
