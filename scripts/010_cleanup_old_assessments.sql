-- Delete old test assessments created 8+ days ago
-- This will cascade delete related records (line items, comparisons) if foreign keys are set up

-- First delete assessment_comparisons for old assessments
DELETE FROM assessment_comparisons
WHERE assessment_id IN (
  SELECT id FROM assessments 
  WHERE created_at < NOW() - INTERVAL '8 days'
);

-- Then delete assessment_line_items for old assessments
DELETE FROM assessment_line_items
WHERE assessment_id IN (
  SELECT id FROM assessments 
  WHERE created_at < NOW() - INTERVAL '8 days'
);

-- Finally delete the assessments themselves
DELETE FROM assessments
WHERE created_at < NOW() - INTERVAL '8 days';
