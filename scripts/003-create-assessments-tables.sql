-- Create assessments table to store assessment metadata
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  study_tracking_number TEXT,
  protocol_number TEXT,
  therapeutic_area TEXT NOT NULL,
  business_unit TEXT NOT NULL,
  description TEXT,
  target_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  vendor_file_name TEXT,
  benchmark_source TEXT CHECK (benchmark_source IN ('IQVIA_GRANTPLAN', 'IQVIA_GPI_GRANTSMANAGER')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create assessment_benchmark_files junction table (many-to-many)
CREATE TABLE IF NOT EXISTS assessment_benchmark_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  benchmark_file_id UUID NOT NULL REFERENCES benchmark_files(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(assessment_id, benchmark_file_id)
);

-- Create assessment_line_items table for vendor uploaded data
CREATE TABLE IF NOT EXISTS assessment_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  procedure_name TEXT NOT NULL,
  country TEXT NOT NULL,
  vendor_cost DECIMAL(15, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  category TEXT,
  unit_type TEXT,
  quantity INTEGER DEFAULT 1,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create assessment_comparisons table for AI comparison results
CREATE TABLE IF NOT EXISTS assessment_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  line_item_id UUID NOT NULL REFERENCES assessment_line_items(id) ON DELETE CASCADE,
  matched_procedure_id UUID REFERENCES benchmark_procedures(id),
  matched_procedure_name TEXT,
  benchmark_file_id UUID REFERENCES benchmark_files(id),
  country TEXT,
  
  -- Benchmark values
  benchmark_low DECIMAL(15, 2),
  benchmark_median DECIMAL(15, 2),
  benchmark_high DECIMAL(15, 2),
  benchmark_p10 DECIMAL(15, 2),
  benchmark_p90 DECIMAL(15, 2),
  
  -- Comparison results
  variance_percent DECIMAL(10, 2),
  variance_amount DECIMAL(15, 2),
  flag TEXT CHECK (flag IN ('GREEN', 'YELLOW', 'RED', 'NO_MATCH')),
  flag_reason TEXT,
  
  -- AI analysis
  ai_description TEXT,
  ai_confidence DECIMAL(5, 2),
  match_type TEXT CHECK (match_type IN ('exact', 'fuzzy', 'semantic', 'no_match')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessment_benchmark_files_assessment ON assessment_benchmark_files(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_benchmark_files_benchmark ON assessment_benchmark_files(benchmark_file_id);
CREATE INDEX IF NOT EXISTS idx_assessment_line_items_assessment ON assessment_line_items(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_comparisons_assessment ON assessment_comparisons(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_comparisons_line_item ON assessment_comparisons(line_item_id);
CREATE INDEX IF NOT EXISTS idx_assessment_comparisons_flag ON assessment_comparisons(flag);

-- Enable RLS
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_benchmark_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_comparisons ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust for your auth setup)
CREATE POLICY "Allow all access to assessments" ON assessments FOR ALL USING (true);
CREATE POLICY "Allow all access to assessment_benchmark_files" ON assessment_benchmark_files FOR ALL USING (true);
CREATE POLICY "Allow all access to assessment_line_items" ON assessment_line_items FOR ALL USING (true);
CREATE POLICY "Allow all access to assessment_comparisons" ON assessment_comparisons FOR ALL USING (true);
