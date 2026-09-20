import type { AnalysisRun } from "../modules/analysis/analysis-run.entity.js";

export interface AnalysisRunRepository {
  save(run: AnalysisRun): Promise<void>;
  findById(id: string): Promise<AnalysisRun | null>;
  list(limit?: number): Promise<AnalysisRun[]>;
}
