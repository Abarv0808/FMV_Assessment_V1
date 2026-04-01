-- Update assessment_line_items table with new fields
-- Site, Additional Information, Number of Unit, Total Cost, Currency

-- Add new columns to assessment_line_items
ALTER TABLE assessment_line_items ADD COLUMN IF NOT EXISTS site TEXT;
ALTER TABLE assessment_line_items ADD COLUMN IF NOT EXISTS additional_information TEXT;
ALTER TABLE assessment_line_items ADD COLUMN IF NOT EXISTS number_of_unit DECIMAL(15,2);
ALTER TABLE assessment_line_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2);
ALTER TABLE assessment_line_items ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2);

-- Rename procedure_name to align with requirements (keep both for backwards compatibility)
-- procedure_name will store the original description from file

-- Update assessment_comparisons to store multiple matches
ALTER TABLE assessment_comparisons ADD COLUMN IF NOT EXISTS possible_matches JSONB;
ALTER TABLE assessment_comparisons ADD COLUMN IF NOT EXISTS user_selected BOOLEAN DEFAULT FALSE;
ALTER TABLE assessment_comparisons ADD COLUMN IF NOT EXISTS benchmark_median DECIMAL(15,2);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_assessment_line_items_site ON assessment_line_items(site);
