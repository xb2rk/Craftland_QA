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
}

export interface AnalysisRun {
  id: string;
  kind?: "analysis" | "comparison";
  comparisonSourceRunIds?: [string, string];
  localPath: string;
  baseRef: string;
  currentRef: string;
  status: "queued" | "running" | "completed" | "failed";
  goal: string;
  createdAt: string;
  completedAt?: string;
  projectSummary?: ProjectInspection["summary"];
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
  findings: Array<{
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    filePath: string;
    line?: number;
  }>;
  aiReport?: Record<string, unknown>;
  aiStatus?: "not_configured" | "completed" | "failed" | "skipped";
  error?: string;
}

export interface AnalysisRequest {
  localPath: string;
  baseRef: string;
  currentRef: string;
  goal: string;
}

export async function inspectProject(
  localPath: string
): Promise<ProjectInspection> {
  return requestJson("/api/projects/inspect", {
    method: "POST",
    body: JSON.stringify({ localPath })
  });
}

export async function startAnalysis(
  request: AnalysisRequest
): Promise<AnalysisRun> {
  return requestJson<AnalysisRun>("/api/analysis-runs", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function listAnalysisRuns(): Promise<AnalysisRun[]> {
  const response = await requestJson<{ items: AnalysisRun[] }>(
    "/api/analysis-runs",
    { method: "GET" }
  );
  return response.items;
}

export async function runAnalysis(
  request: AnalysisRequest
): Promise<AnalysisRun> {
  const queued = await startAnalysis(request);
  return waitForAnalysis(queued.id);
}

export async function getAnalysis(id: string): Promise<AnalysisRun> {
  return requestJson(`/api/analysis-runs/${encodeURIComponent(id)}`, {
    method: "GET"
  });
}

export async function waitForAnalysis(
  id: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (run: AnalysisRun) => void;
  } = {}
): Promise<AnalysisRun> {
  const intervalMs = options.intervalMs ?? 1_000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const run = await getAnalysis(id);
    options.onProgress?.(run);
    if (run.status === "completed" || run.status === "failed") {
      return run;
    }
    await delay(intervalMs);
  }
  throw new Error("Analysis did not finish within the configured timeout.");
}

async function requestJson<T>(
  url: string,
  init: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      ...init.headers
    }
  });
  const responseText = await response.text();
  let body: unknown;
  if (responseText.trim().length === 0) {
    if (response.ok) {
      throw new Error(
        "Backend returned an empty response. Restart the backend and try again."
      );
    }
    throw new Error(
      `Backend returned an empty error response (${response.status}). Check that the backend is running on port 3000.`
    );
  }
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Backend returned a non-JSON response (${response.status}). Check that the backend is running on port 3000.`
    );
  }
  if (!response.ok) {
    const errorBody = body as { error?: { message?: string } };
    throw new Error(
      errorBody.error?.message ??
        `Request failed with status ${response.status}.`
    );
  }
  return body as T;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
