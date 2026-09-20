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

export type AnalysisLens =
  | "pre_merge"
  | "balance"
  | "economy"
  | "localization"
  | "explain"
  | "test_plan";

export type Verbosity = "short" | "medium" | "long" | "auto";

export interface WhatIfResult {
  filePath: string;
  baseRef: string;
  keyColumn: string;
  keyValue: string;
  column: string;
  oldValue: string;
  newValue: string;
  findings: Finding[];
  aiReport?: Record<string, unknown>;
  aiStatus: AiStatus;
  error?: string;
}

export interface RunExchange {
  id: string;
  question: string;
  answer: string;
  citations: string[];
  createdAt: string;
}

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
    unifiedDiff?: string;
    diffTruncated?: boolean;
  };
  findings: Finding[];
  aiReport?: Record<string, unknown>;
  aiStatus?: AiStatus;
  error?: string;
  lens?: AnalysisLens;
  verbosity?: Verbosity;
  focusPaths?: string[];
  notes?: string;
  exchanges?: RunExchange[];
}
