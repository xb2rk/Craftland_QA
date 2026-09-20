import type { AnalysisRun, RunExchange } from "../modules/analysis/analysis-run.entity.js";
import type { AnalysisRunRepository } from "./repository.js";

export class InMemoryAnalysisRunRepository implements AnalysisRunRepository {
  private readonly runs = new Map<string, AnalysisRun>();

  async save(run: AnalysisRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async findById(id: string): Promise<AnalysisRun | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async list(limit = 100): Promise<AnalysisRun[]> {
    return [...this.runs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((run) => structuredClone(run));
  }

  async appendExchange(runId: string, exchange: RunExchange): Promise<RunExchange[]> {
    const run = this.runs.get(runId);
    if (run === undefined) return [];
    const exchanges = [...(run.exchanges ?? []), structuredClone(exchange)];
    this.runs.set(runId, { ...run, exchanges });
    return structuredClone(exchanges);
  }

  async listExchanges(runId: string): Promise<RunExchange[]> {
    const run = this.runs.get(runId);
    return run?.exchanges ? structuredClone(run.exchanges) : [];
  }

  /** Mark stale running jobs as failed after restart. No-op for memory. */
  async markStaleRunningAsFailed(): Promise<number> {
    let count = 0;
    for (const run of this.runs.values()) {
      if (run.status === "queued" || run.status === "running") {
        this.runs.set(run.id, {
          ...run,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: "Server restarted before this run completed.",
        });
        count += 1;
      }
    }
    return count;
  }
}
