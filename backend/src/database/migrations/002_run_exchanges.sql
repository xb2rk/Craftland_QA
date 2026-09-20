-- Follow-up Q&A exchanges per analysis run.
CREATE TABLE IF NOT EXISTS run_exchanges (
  id VARCHAR(100) PRIMARY KEY,
  analysis_run_id VARCHAR(100) NOT NULL,
  question TEXT NOT NULL,
  answer MEDIUMTEXT NOT NULL,
  citations_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_run_exchanges_run FOREIGN KEY (analysis_run_id)
    REFERENCES analysis_runs (id) ON DELETE CASCADE,
  INDEX idx_run_exchanges_run (analysis_run_id)
);
