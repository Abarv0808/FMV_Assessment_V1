-- Create assessment_audit_log table to persist the History / Audit Trail.
-- Previously audit events lived only in React state and were lost on reload,
-- so the History tab always appeared blank. This table durably records every
-- user action taken on an assessment.
CREATE TABLE IF NOT EXISTS assessment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL DEFAULT 'Unknown User',
  action TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup of a single assessment's history, newest first.
CREATE INDEX IF NOT EXISTS idx_assessment_audit_log_assessment
  ON assessment_audit_log(assessment_id, created_at DESC);

-- Match the permissive RLS pattern used by the other assessment tables.
ALTER TABLE assessment_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_audit_log'
      AND policyname = 'Allow all access to assessment_audit_log'
  ) THEN
    CREATE POLICY "Allow all access to assessment_audit_log"
      ON assessment_audit_log FOR ALL USING (true);
  END IF;
END $$;
