-- Verbosity, focus paths, and reviewer notes for each analysis run.
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS verbosity VARCHAR(10) NULL;
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS focus_paths_json JSON NULL;
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS notes TEXT NULL;
