import {
  ApiError,
  type AnalysisRun,
  type BrowseResult,
  type Health,
  type ProjectBranch,
  type ProjectCommit,
  type ProjectInspection,
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
  }): Promise<AnalysisRun> {
    return requestJson<AnalysisRun>("/api/analysis-runs", {
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
};
