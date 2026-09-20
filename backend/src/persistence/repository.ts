import type { AnalysisRun, RunExchange } from "../modules/analysis/analysis-run.entity.js";

export interface AnalysisRunRepository {
  save(run: AnalysisRun): Promise<void>;
  findById(id: string): Promise<AnalysisRun | null>;
  list(limit?: number): Promise<AnalysisRun[]>;
  appendExchange(runId: string, exchange: RunExchange): Promise<RunExchange[]>;
  listExchanges(runId: string): Promise<RunExchange[]>;
}
