import type { Finding } from "./finding.js";

export type AnalysisRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type AnalysisRunKind = "analysis" | "comparison";

export interface AnalysisRun {
  id: string;
  kind?: AnalysisRunKind;
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
    changedFiles: Array<{
      changeType: "added" | "modified" | "deleted" | "renamed" | "untracked";
      relativePath: string;
      previousPath?: string;
    }>;
  };
  findings: Finding[];
  aiReport?: Record<string, unknown>;
  aiStatus?: "not_configured" | "completed" | "failed" | "skipped";
  error?: string;
}
