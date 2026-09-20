-- Lens selected for each analysis run.
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS lens VARCHAR(20) NULL;
