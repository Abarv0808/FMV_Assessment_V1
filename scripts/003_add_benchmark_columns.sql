-- Migration: Add new columns to benchmark tables for IQVIA GrantPlan data
-- This migration adds p90, p100, category, and source_ref columns

-- Check if benchmark_files table exists, if not create it
CREATE TABLE IF NOT EXISTS benchmark_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  country TEXT NOT NULL,
  indication TEXT NOT NULL,
  indication_code TEXT,
  trial_phase TEXT NOT NULL DEFAULT 'Phase I',
  currency TEXT NOT NULL DEFAULT 'EUR',
  source TEXT NOT NULL DEFAULT 'IQVIA_GRANTPLAN',
  study_code TEXT,
  patient_type TEXT,
  budget_type TEXT,
  overhead_percent DECIMAL(5,2),
  procedure_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by TEXT
);

-- Check if benchmark_procedures table exists, if not create it
CREATE TABLE IF NOT EXISTS benchmark_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_file_id UUID REFERENCES benchmark_files(id) ON DELETE CASCADE,
  procedure_code TEXT NOT NULL,
  procedure_name TEXT NOT NULL,
  category TEXT DEFAULT 'Procedures',
  p25 DECIMAL(12,2),
  p50 DECIMAL(12,2),
  p75 DECIMAL(12,2),
  p90 DECIMAL(12,2),
  p100 DECIMAL(12,2),
  mean DECIMAL(12,2),
  sample_size INTEGER,
  source_ref TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns if they don't exist (for existing tables)
DO $$ 
BEGIN
  -- Add p90 column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'benchmark_procedures' AND column_name = 'p90'
  ) THEN
    ALTER TABLE benchmark_procedures ADD COLUMN p90 DECIMAL(12,2);
  END IF;
  
  -- Add p100 column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'benchmark_procedures' AND column_name = 'p100'
  ) THEN
    ALTER TABLE benchmark_procedures ADD COLUMN p100 DECIMAL(12,2);
  END IF;
  
  -- Add category column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'benchmark_procedures' AND column_name = 'category'
  ) THEN
    ALTER TABLE benchmark_procedures ADD COLUMN category TEXT DEFAULT 'Procedures';
  END IF;
  
  -- Add source_ref column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'benchmark_procedures' AND column_name = 'source_ref'
  ) THEN
    ALTER TABLE benchmark_procedures ADD COLUMN source_ref TEXT;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_benchmark_files_country ON benchmark_files(country);
CREATE INDEX IF NOT EXISTS idx_benchmark_files_indication ON benchmark_files(indication);
CREATE INDEX IF NOT EXISTS idx_benchmark_files_source ON benchmark_files(source);
CREATE INDEX IF NOT EXISTS idx_benchmark_procedures_file_id ON benchmark_procedures(benchmark_file_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_procedures_code ON benchmark_procedures(procedure_code);
CREATE INDEX IF NOT EXISTS idx_benchmark_procedures_category ON benchmark_procedures(category);
