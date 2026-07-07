-- FMV Domain-Knowledge Matching Layer
-- Creates three editable rule tables that let the FMV team teach the comparison
-- engine domain knowledge that plain fuzzy/AI matching cannot infer, e.g.
-- "CRA -> Monitoring per hour", "project manager -> Administrative",
-- "PhD student -> always link Data Entry", "IRB/EC submission -> initial fee
-- by default, amendment/renewal/close-out when those keywords are present".
--
-- These are deterministic, hard-enforced rules applied AFTER AI/fuzzy matching
-- in app/api/assessments/run-comparison/route.ts.

-- ---------------------------------------------------------------------------
-- 1. Role / term synonym rules (issues 1,2,3,4,5,7b,9,10)
--    Map vendor keywords/roles to benchmark targets.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fmv_synonym_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  -- Vendor-side keywords/phrases that activate this rule.
  triggers TEXT[] NOT NULL DEFAULT '{}',
  -- How triggers are matched against the description: 'word' (whole-word) or 'substring'.
  match_mode TEXT NOT NULL DEFAULT 'word',
  -- Preferred: exact benchmark procedure_code(s) to link.
  target_codes TEXT[] NOT NULL DEFAULT '{}',
  -- Fallback when the code varies by country: benchmark NAME keywords to resolve.
  target_keywords TEXT[] NOT NULL DEFAULT '{}',
  -- When true this benchmark is ALWAYS injected if triggers match, regardless of
  -- what AI/fuzzy returned (e.g. PhD student -> Data Entry NP005).
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  priority INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Therapeutic areas (issue 6)
--    Detect a TA word near "physician/specialist" and prefer the TA-specific
--    physician benchmark.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fmv_therapeutic_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Alternative spellings / abbreviations (e.g. {haematology, heme}).
  aliases TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Disambiguation rules (issues 7a, 8)
--    Choose a default benchmark from a family, overridden by keywords.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fmv_disambiguation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  -- Description keywords/phrases that activate this rule family.
  triggers TEXT[] NOT NULL DEFAULT '{}',
  -- Default benchmark code(s) when no override keyword is present
  -- (e.g. SC005 initial IRB/EC fee; SC020 archive total cost).
  default_codes TEXT[] NOT NULL DEFAULT '{}',
  -- Ordered list of { keywords: string[], codes: string[] }. The first override
  -- whose keywords all/any appear in the description wins.
  overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ordering indexes (rules are applied by priority then label).
CREATE INDEX IF NOT EXISTS idx_fmv_synonym_rules_enabled
  ON fmv_synonym_rules(enabled, priority);
CREATE INDEX IF NOT EXISTS idx_fmv_disambiguation_rules_enabled
  ON fmv_disambiguation_rules(enabled, priority);
CREATE INDEX IF NOT EXISTS idx_fmv_therapeutic_areas_enabled
  ON fmv_therapeutic_areas(enabled);

-- Match the permissive RLS pattern used by the other tables in this project.
ALTER TABLE fmv_synonym_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmv_therapeutic_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmv_disambiguation_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fmv_synonym_rules' AND policyname = 'Allow all access to fmv_synonym_rules') THEN
    CREATE POLICY "Allow all access to fmv_synonym_rules" ON fmv_synonym_rules FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fmv_therapeutic_areas' AND policyname = 'Allow all access to fmv_therapeutic_areas') THEN
    CREATE POLICY "Allow all access to fmv_therapeutic_areas" ON fmv_therapeutic_areas FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fmv_disambiguation_rules' AND policyname = 'Allow all access to fmv_disambiguation_rules') THEN
    CREATE POLICY "Allow all access to fmv_disambiguation_rules" ON fmv_disambiguation_rules FOR ALL USING (true);
  END IF;
END $$;
