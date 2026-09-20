CREATE TABLE project_profiles (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  detector_config JSON NOT NULL,
  config_patterns JSON NOT NULL,
  source_patterns JSON NOT NULL,
  relation_rules JSON NOT NULL,
  simulation_templates JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_profiles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analysis_runs (
  id CHAR(36) NOT NULL,
  profile_id CHAR(36) NULL,
  local_path VARCHAR(1024) NOT NULL,
  base_ref VARCHAR(255) NOT NULL,
  current_ref VARCHAR(255) NOT NULL,
  base_commit CHAR(40) NULL,
  current_commit CHAR(40) NULL,
  goal TEXT NOT NULL,
  status ENUM('queued', 'running', 'completed', 'failed') NOT NULL,
  summary_json JSON NULL,
  ai_report_json JSON NULL,
  ai_status ENUM('not_configured', 'completed', 'failed', 'skipped') NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_analysis_runs_status_created (status, created_at),
  KEY idx_analysis_runs_profile_created (profile_id, created_at),
  CONSTRAINT fk_analysis_runs_profile
    FOREIGN KEY (profile_id) REFERENCES project_profiles(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analysis_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_run_id CHAR(36) NOT NULL,
  relative_path VARCHAR(1024) NOT NULL,
  revision ENUM('base', 'current', 'diff') NOT NULL,
  kind ENUM('config', 'source', 'text') NOT NULL,
  change_type ENUM('added', 'modified', 'deleted', 'unchanged', 'untracked')
    NOT NULL,
  content_hash CHAR(64) NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  metadata_json JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_analysis_files_revision_path
    (analysis_run_id, revision, relative_path(500)),
  KEY idx_analysis_files_run_kind (analysis_run_id, kind),
  CONSTRAINT fk_analysis_files_run
    FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE findings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_run_id CHAR(36) NOT NULL,
  source ENUM('deterministic', 'compiler', 'ai', 'simulation') NOT NULL,
  code VARCHAR(100) NOT NULL,
  category VARCHAR(100) NULL,
  severity ENUM('error', 'warning', 'info') NOT NULL,
  certainty ENUM('confirmed', 'probable', 'hypothesis', 'unknown')
    NOT NULL DEFAULT 'confirmed',
  title VARCHAR(500) NULL,
  message TEXT NOT NULL,
  player_impact TEXT NULL,
  file_path VARCHAR(1024) NOT NULL,
  line_number INT UNSIGNED NULL,
  evidence_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_findings_run_severity (analysis_run_id, severity),
  KEY idx_findings_run_code (analysis_run_id, code),
  CONSTRAINT fk_findings_run
    FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_exchanges (
  id CHAR(36) NOT NULL,
  analysis_run_id CHAR(36) NOT NULL,
  stage ENUM('project_discovery', 'context_selection', 'impact_analysis',
    'report_synthesis') NOT NULL,
  workflow_request_id VARCHAR(255) NULL,
  status ENUM('started', 'succeeded', 'failed', 'invalid_response') NOT NULL,
  manifest_json JSON NOT NULL,
  response_json JSON NULL,
  consumed_tokens INT UNSIGNED NULL,
  elapsed_time_ms INT UNSIGNED NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ai_exchanges_run_stage (analysis_run_id, stage, created_at),
  CONSTRAINT fk_ai_exchanges_run
    FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE simulation_runs (
  id CHAR(36) NOT NULL,
  analysis_run_id CHAR(36) NOT NULL,
  simulation_type VARCHAR(100) NOT NULL,
  status ENUM('queued', 'running', 'completed', 'failed') NOT NULL,
  input_json JSON NOT NULL,
  output_json JSON NULL,
  seed BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_simulation_runs_analysis_created (analysis_run_id, created_at),
  CONSTRAINT fk_simulation_runs_analysis
    FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
