import type { AnalysisRun } from "../domain/analysis-run.js";

export interface AnalysisRunRepository {
  save(run: AnalysisRun): Promise<void>;
  findById(id: string): Promise<AnalysisRun | null>;
  list(): Promise<AnalysisRun[]>;
}

export class InMemoryAnalysisRunRepository
  implements AnalysisRunRepository
{
  private readonly runs = new Map<string, AnalysisRun>();

  async save(run: AnalysisRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async findById(id: string): Promise<AnalysisRun | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async list(): Promise<AnalysisRun[]> {
    return [...this.runs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((run) => structuredClone(run));
  }
}
