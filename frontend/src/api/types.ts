export type AnalysisStatus = "queued" | "running" | "completed" | "failed";
export type AnalysisKind = "analysis" | "comparison";
export type AiStatus = "not_configured" | "completed" | "failed" | "skipped";
export type FindingSeverity = "error" | "warning" | "info";
export type AnalysisLens =
  | "pre_merge"
  | "balance"
  | "economy"
  | "localization"
  | "explain"
  | "test_plan";

export const ANALYSIS_LENSES: Array<{ value: AnalysisLens; label: string; hint: string }> = [  { value: "pre_merge", label: "Pre-merge risk check", hint: "Ship / don't-ship verdict with verification list." },
  { value: "balance", label: "Balance review", hint: "Difficulty curve, outliers, unfair spikes." },
  { value: "economy", label: "Economy audit", hint: "Prices, rewards, progression pacing." },
  { value: "localization", label: "Localization QA", hint: "Row widths, keys, references across CSVs." },
  { value: "explain", label: "Explain this change", hint: "Plain designer language, no jargon." },
  { value: "test_plan", label: "Test plan", hint: "QA checklist derived from the diff." },
];

export type Verbosity = "short" | "medium" | "long" | "auto";

export const VERBOSITIES: Array<{ value: Verbosity; label: string; hint: string }> = [
  { value: "short", label: "Short", hint: "Verdict plus at most 3 findings and 3 recommendations." },
  { value: "medium", label: "Medium", hint: "Every material finding, kept concise." },
  { value: "long", label: "Long", hint: "Full detail on every finding and recommendation." },
  { value: "auto", label: "Auto", hint: "Response sized to the change." },
];

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
    unifiedDiff?: string;
    diffTruncated?: boolean;
  };
  findings: Finding[];
  aiReport?: NormalizedAiReport | Record<string, unknown>;
  aiStatus?: AiStatus;
  error?: string;
  lens?: AnalysisLens;
  verbosity?: Verbosity;
  focusPaths?: string[];
  notes?: string;
  exchanges?: RunExchange[];
}

export interface ProjectDiffResult {
  baseCommit: string;
  currentCommit: string;
  currentIsWorktree: boolean;
  changedFiles: ChangedFileRef[];
  unifiedDiff?: string;
  diffTruncated?: boolean;
}

export interface WhatIfResult {
  filePath: string;
  baseRef: string;
  keyColumn: string;
  keyValue: string;
  column: string;
  oldValue: string;
  newValue: string;
  findings: Finding[];
  answer?: string;
  citations?: string[];
  aiReport?: NormalizedAiReport | Record<string, unknown>;
  aiStatus: "not_configured" | "completed" | "failed";
  error?: string;
}

export type WriterKind = "commit" | "pr";

export interface WriterDraft {
  kind: WriterKind;
  text: string;
  aiStatus: "not_configured" | "completed" | "failed" | "skipped";
  /** Convention sources discovered in the repo (e.g. "AGENTS.md"). */
  conventions: string[];
  error?: string;
}

export type LocalizationMode = "check" | "translate";

export interface LocalizationTranslation {
  key: string;
  language: string;
  oldValue: string;
  newValue: string;
}

export interface LocalizationCheckOutput {
  baseRef: string;
  /** The file actually checked, when the request scoped to one file. */
  filePath?: string;
  /** Language codes found in LanguageKey rows. */
  languages: string[];
  filesChecked: string[];
  findings: Finding[];
  aiReport?: NormalizedAiReport | Record<string, unknown>;
  aiStatus: "not_configured" | "completed" | "failed";
  /** Proposed cell fills, translate mode only. */
  translations: LocalizationTranslation[];
  /** CSV with the translations applied, translate mode only. */
  translatedCsv?: string;
  error?: string;
}

export interface LocalizationAnswer {
  answer: string;
  citations: string[];
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
  persistence: "memory" | "file" | "mysql";
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
