-- Minimal greenfield schema. Only tables actually used by the code.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id VARCHAR(100) PRIMARY KEY,
  kind VARCHAR(20) NOT NULL DEFAULT 'analysis',
  comparison_source_ids JSON NULL,
  local_path VARCHAR(1024) NOT NULL,
  base_ref VARCHAR(255) NOT NULL,
  current_ref VARCHAR(255) NOT NULL,
  goal TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  project_summary_json JSON NULL,
  comparison_json JSON NULL,
  ai_report_json JSON NULL,
  ai_status VARCHAR(20) NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at TIMESTAMP(3) NULL,
  INDEX idx_analysis_runs_created_at (created_at),
  INDEX idx_analysis_runs_status (status)
);

CREATE TABLE IF NOT EXISTS findings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  analysis_run_id VARCHAR(100) NOT NULL,
  code VARCHAR(128) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  line_number INT NULL,
  evidence_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_findings_run FOREIGN KEY (analysis_run_id)
    REFERENCES analysis_runs (id) ON DELETE CASCADE,
  INDEX idx_findings_run (analysis_run_id)
);
