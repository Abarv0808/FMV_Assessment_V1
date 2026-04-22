-- Add ai_matches column to assessment_comparisons table
-- This stores the AI-generated benchmark matches as JSONB for persistence

ALTER TABLE assessment_comparisons 
ADD COLUMN IF NOT EXISTS ai_matches JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN assessment_comparisons.ai_matches IS 'Stores AI-generated benchmark matches with procedure names, similarity scores, and pricing from all countries';
