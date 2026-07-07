-- Seed the FMV domain-knowledge matching rules for issues 1-10.
-- Idempotent: clears prior seed rows (by label) before inserting so re-running
-- this script refreshes the defaults without creating duplicates. The FMV team
-- can freely edit/add/remove rules afterwards via the admin UI.

-- ---------------------------------------------------------------------------
-- Synonym / role rules
-- ---------------------------------------------------------------------------
DELETE FROM fmv_synonym_rules WHERE label IN (
  'CRA -> Monitoring (per hour)',
  'Project Manager -> Administrative (per hour)',
  'Statistician -> Biostatistician',
  'Epidemiologist -> Biostatistician + Physician',
  'Researcher MD -> Physician',
  'Haematologist -> Physician: Hematology',
  'PhD Student -> Data Entry (mandatory)'
);

INSERT INTO fmv_synonym_rules (label, triggers, match_mode, target_codes, target_keywords, is_mandatory, priority, notes) VALUES
  ('CRA -> Monitoring (per hour)',
    ARRAY['cra','clinical research associate','clinical monitor','site monitor'], 'word',
    ARRAY['SC155'], ARRAY['monitoring'], FALSE, 20,
    'CRA effort maps to the site-cost Monitoring - Per Hour benchmark.'),

  ('Project Manager -> Administrative (per hour)',
    ARRAY['project manager','project management','project lead','pm'], 'word',
    ARRAY['SC070'], ARRAY['administrative'], FALSE, 20,
    'Project manager effort maps to Fixed Administrative Costs - Per Hour.'),

  ('Statistician -> Biostatistician',
    ARRAY['statistician','biostatistician','statistics','statistical'], 'word',
    ARRAY['NP109'], ARRAY['biostatistician'], FALSE, 30,
    'Any statistician role maps to the Biostatistician benchmark.'),

  ('Epidemiologist -> Biostatistician + Physician',
    ARRAY['epidemiologist','epidemiology','epidemiological'], 'word',
    ARRAY['NP109','NP004'], ARRAY['biostatistician','physician'], FALSE, 30,
    'No dedicated epidemiologist benchmark exists; map to Biostatistician + general Physician.'),

  ('Researcher MD -> Physician',
    ARRAY['researcher md','research md','medical doctor','md','physician researcher'], 'word',
    ARRAY['NP004'], ARRAY['physician'], FALSE, 40,
    'MD / researcher-MD roles map to the general Physician benchmark.'),

  ('Haematologist -> Physician: Hematology',
    ARRAY['haematologist','hematologist','haematology','hematology'], 'word',
    ARRAY['NP039'], ARRAY['physician','hematology'], FALSE, 15,
    'Haematology personnel map to the Physician: Hematology benchmark.'),

  ('PhD Student -> Data Entry (mandatory)',
    ARRAY['phd student','ph.d student','phd candidate','doctoral student','phd researcher','doctoral candidate'], 'word',
    ARRAY['NP005'], ARRAY['data entry'], TRUE, 10,
    'PhD students are always additionally linked to Data Entry, on top of task-description matches.');

-- ---------------------------------------------------------------------------
-- Disambiguation rules
-- ---------------------------------------------------------------------------
DELETE FROM fmv_disambiguation_rules WHERE label IN (
  'Archive / Document Storage',
  'IRB / EC Submission Fee'
);

INSERT INTO fmv_disambiguation_rules (label, triggers, default_codes, overrides, priority, notes) VALUES
  ('Archive / Document Storage',
    ARRAY['archive','archiving','archival','document storage','document retention','record retention','records retention','documents retention'],
    ARRAY['SC020'],
    '[
      {"keywords":["per box","per-box","by box","boxes"],"codes":["SC148"]},
      {"keywords":["per year","per-year","annual","annually","yearly","per annum"],"codes":["SC012"]}
    ]'::jsonb,
    10,
    'Archive defaults to the Total Cost benchmark (SC020) unless per-year (SC012) or per-box (SC148) is specified. SC020 must exist in benchmark_procedures (re-upload if missing).'),

  ('IRB / EC Submission Fee',
    ARRAY['irb','ec submission','ethics committee','institutional review','ethics submission','irb/ec','iec','ethics review','irb fee','ec fee'],
    ARRAY['SC005'],
    '[
      {"keywords":["close out","close-out","closeout"],"codes":["SC151"]},
      {"keywords":["renewal","annual review","continuing review","annual irb"],"codes":["SC013"]},
      {"keywords":["preparation initial","prepare initial","initial submission preparation","preparation for initial"],"codes":["SC019"]},
      {"keywords":["preparation amendment","prepare amendment","document preparation amendment","preparation for amendment"],"codes":["SC018"]},
      {"keywords":["amendment complex","complex amendment","full board"],"codes":["SC161"]},
      {"keywords":["amendment simple","simple amendment","expedited"],"codes":["SC160"]},
      {"keywords":["amendment"],"codes":["SC014"]}
    ]'::jsonb,
    10,
    'IRB/EC submission defaults to the initial Local Ethics Committee/IRB fee (SC005). Keyword overrides select renewal, amendment (simple/complex/generic), preparation, or close-out.');

-- ---------------------------------------------------------------------------
-- Therapeutic areas (for TA-specific physician preference)
-- ---------------------------------------------------------------------------
DELETE FROM fmv_therapeutic_areas WHERE name IN (
  'Hematology','Gastroenterology','Oncology','Cardiology','Neurology','Endocrinology',
  'Rheumatology','Urology','Pediatrics','Geriatrics','Pulmonary Medicine',
  'Infectious Disease','Internal Medicine','Family practice','Radiology','Pathology',
  'Otolaryngology','Critical Care Unit'
);

INSERT INTO fmv_therapeutic_areas (name, aliases) VALUES
  ('Hematology', ARRAY['haematology','heme','hematologic','haematologic','hematologist','haematologist']),
  ('Gastroenterology', ARRAY['gastro','gi','gastroenterologist']),
  ('Oncology', ARRAY['oncologic','cancer','oncologist']),
  ('Cardiology', ARRAY['cardiac','cardiovascular','cardiologist']),
  ('Neurology', ARRAY['neurologic','neuro','neurologist']),
  ('Endocrinology', ARRAY['endocrine','endocrinologist']),
  ('Rheumatology', ARRAY['rheumatologic','rheumatologist']),
  ('Urology', ARRAY['urologic','urologist']),
  ('Pediatrics', ARRAY['paediatrics','pediatric','paediatric','pediatrician']),
  ('Geriatrics', ARRAY['geriatric','geriatrician']),
  ('Pulmonary Medicine', ARRAY['pulmonology','pulmonary','respiratory','pulmonologist']),
  ('Infectious Disease', ARRAY['infectious diseases','id specialist']),
  ('Internal Medicine', ARRAY['internal med','internist']),
  ('Family practice', ARRAY['family medicine','family practitioner','gp','general practitioner']),
  ('Radiology', ARRAY['radiologic','radiologist']),
  ('Pathology', ARRAY['pathologic','pathologist']),
  ('Otolaryngology', ARRAY['ent','ear nose throat','otolaryngologist']),
  ('Critical Care Unit', ARRAY['critical care','icu','intensive care']);
