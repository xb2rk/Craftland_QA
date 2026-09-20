import {
  ApiError,
  type AnalysisLens,
  type AnalysisRun,
  type BrowseResult,
  type Health,
  type LocalizationCheckOutput,
  type ProjectBranch,
  type ProjectCommit,
  type ProjectDiffResult,
  type ProjectInspection,
  type RunExchange,
  type Verbosity,
  type WhatIfResult,
  type WriterDraft,
  type WriterKind,
} from "./types.js";

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();
  const body: unknown = text.trim().length === 0 ? null : JSON.parse(text);
  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      errorBody?.error?.code ?? "REQUEST_FAILED",
      response.status,
      errorBody?.error?.message ?? `Request failed with status ${response.status}.`,
    );
  }
  return body as T;
}

export const api = {
  health(): Promise<Health> {
    return requestJson<Health>("/api/health", { method: "GET" });
  },
  inspect(localPath: string): Promise<ProjectInspection> {
    return requestJson<ProjectInspection>("/api/projects/inspect", {
      method: "POST",
      body: JSON.stringify({ localPath }),
    });
  },
  browse(path?: string): Promise<BrowseResult> {
    const url =
      path !== undefined && path.length > 0
        ? `/api/projects/browse?path=${encodeURIComponent(path)}`
        : "/api/projects/browse";
    return requestJson<BrowseResult>(url, { method: "GET" });
  },
  branches(localPath: string): Promise<{ branches: ProjectBranch[] }> {
    return requestJson<{ branches: ProjectBranch[] }>(
      `/api/projects/branches?localPath=${encodeURIComponent(localPath)}`,
      { method: "GET" },
    );
  },
  commits(
    localPath: string,
    search?: string,
    limit = 50,
  ): Promise<{ commits: ProjectCommit[] }> {
    const params = new URLSearchParams({ localPath, limit: String(limit) });
    if (search !== undefined && search.trim().length > 0) {
      params.set("search", search.trim());
    }
    return requestJson<{ commits: ProjectCommit[] }>(
      `/api/projects/commits?${params.toString()}`,
      { method: "GET" },
    );
  },
  startAnalysis(input: {
    localPath: string;
    baseRef: string;
    currentRef: string;
    goal: string;
    lens?: AnalysisLens;
    verbosity?: Verbosity;
    focusPaths?: string[];
    notes?: string;
  }): Promise<AnalysisRun> {
    return requestJson<AnalysisRun>("/api/analysis-runs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  projectDiff(input: {
    localPath: string;
    baseRef: string;
    currentRef: string;
  }): Promise<ProjectDiffResult> {
    return requestJson<ProjectDiffResult>("/api/projects/diff", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  runWhatIf(input: {
    localPath: string;
    baseRef?: string;
    filePath: string;
    keyColumn?: string;
    keyValue: string;
    column: string;
    newValue: string;
    goal?: string;
  }): Promise<WhatIfResult> {
    return requestJson<WhatIfResult>("/api/projects/whatif", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  draftWriter(input: {
    localPath: string;
    baseRef: string;
    currentRef: string;
    kind: WriterKind;
    goal?: string;
  }): Promise<WriterDraft> {
    return requestJson<WriterDraft>("/api/projects/write", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  runLocalization(input: {
    localPath: string;
    baseRef: string;
    goal?: string;
  }): Promise<LocalizationCheckOutput> {
    return requestJson<LocalizationCheckOutput>("/api/projects/localization", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  compare(input: {
    analysisRunAId: string;
    analysisRunBId: string;
    goal: string;
  }): Promise<AnalysisRun> {
    return requestJson<AnalysisRun>("/api/analysis-runs/compare", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listAnalyses(limit = 100): Promise<AnalysisRun[]> {
    return requestJson<AnalysisRun[]>(`/api/analysis-runs?limit=${limit}`, {
      method: "GET",
    });
  },
  getAnalysis(id: string): Promise<AnalysisRun> {
    return requestJson<AnalysisRun>(
      `/api/analysis-runs/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
  },
  askQuestion(id: string, question: string): Promise<RunExchange> {
    return requestJson<RunExchange>(
      `/api/analysis-runs/${encodeURIComponent(id)}/questions`,
      { method: "POST", body: JSON.stringify({ question }) },
    );
  },
  listQuestions(id: string): Promise<RunExchange[]> {
    return requestJson<RunExchange[]>(
      `/api/analysis-runs/${encodeURIComponent(id)}/questions`,
      { method: "GET" },
    );
  },
  importRun(run: Record<string, unknown>): Promise<AnalysisRun> {
    return requestJson<AnalysisRun>("/api/analysis-runs/import", {
      method: "POST",
      body: JSON.stringify({ run }),
    });
  },
};
