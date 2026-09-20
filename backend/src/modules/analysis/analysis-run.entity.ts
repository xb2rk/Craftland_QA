export type FindingSeverity = "error" | "warning" | "info";

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  filePath: string;
  line?: number;
  evidence?: Record<string, unknown>;
}

export type AnalysisRunStatus = "queued" | "running" | "completed" | "failed";
export type AnalysisRunKind = "analysis" | "comparison";
export type AiStatus = "not_configured" | "completed" | "failed" | "skipped";

export interface ChangedFileRef {
  changeType: "added" | "modified" | "deleted" | "renamed" | "untracked";
  relativePath: string;
  previousPath?: string;
}

export interface AnalysisRun {
  id: string;
  kind: AnalysisRunKind;
  comparisonSourceRunIds?: [string, string];
  localPath: string;
  baseRef: string;
  currentRef: string;
  goal: string;
  status: AnalysisRunStatus;
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
  aiReport?: Record<string, unknown>;
  aiStatus?: AiStatus;
  error?: string;
}
