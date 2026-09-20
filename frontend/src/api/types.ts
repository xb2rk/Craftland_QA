export type AnalysisStatus = "queued" | "running" | "completed" | "failed";
export type AnalysisKind = "analysis" | "comparison";
export type AiStatus = "not_configured" | "completed" | "failed" | "skipped";
export type FindingSeverity = "error" | "warning" | "info";

export interface ChangedFileRef {
  changeType: "added" | "modified" | "deleted" | "renamed" | "untracked";
  relativePath: string;
  previousPath?: string;
}

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  filePath: string;
  line?: number;
  evidence?: Record<string, unknown>;
}

export interface AnalysisRun {
  id: string;
  kind: AnalysisKind;
  comparisonSourceRunIds?: [string, string];
  localPath: string;
  baseRef: string;
  currentRef: string;
  goal: string;
  status: AnalysisStatus;
  createdAt: string;
  completedAt?: string;
  projectSummary?: {
    configFiles: number;
    sourceFiles: number;
    otherTextFiles: number;
  };
  comparison?: {
    baseCommit: string;
    currentCommit: string;
    currentIsWorktree: boolean;
    changedFiles: ChangedFileRef[];
  };
  findings: Finding[];
  aiReport?: NormalizedAiReport | Record<string, unknown>;
  aiStatus?: AiStatus;
  error?: string;
}

export interface NormalizedAiReport {
  schema_version: string;
  stage: string;
  status: string;
  summary: {
    overall_assessment: string;
    risk_level: string;
    confidence: string;
    change_scope: string;
  };
  findings: Array<{
    id: string;
    title: string;
    dimension: string;
    severity: string;
    certainty: string;
    description: string;
    evidence: unknown;
    impact: string;
    flow_safety: string;
    recovery_risk: string;
  }>;
  inferences: Array<Record<string, unknown>>;
  hypotheses: Array<Record<string, unknown>>;
  unknowns: Array<unknown>;
  recommendations: Array<{
    id: string;
    priority: string;
    dimension: string;
    recommendation: string;
    justification: string;
    evidence: unknown;
  }>;
}

export interface ProjectInspection {
  rootPath: string;
  repository: {
    branch: string;
    headCommit: string;
    hasUncommittedChanges: boolean;
  };
  summary: {
    configFiles: number;
    sourceFiles: number;
    otherTextFiles: number;
  };
  files: Array<{
    relativePath: string;
    kind: "config" | "source" | "text";
    sizeBytes: number;
  }>;
  totalFiles: number;
  truncated: boolean;
}

export interface Health {
  status: string;
  now: string;
  persistence: "memory" | "mysql";
  ai: { configured: boolean };
  pendingJobs: number;
}

export interface ProjectBranch {
  name: string;
  shortCommit: string;
  upstream: string | null;
  current: boolean;
}

export interface ProjectCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  hasSubdirectories: boolean;
  isRepository: boolean;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  entries: DirectoryEntry[];
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}
