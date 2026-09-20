import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import type { AnalysisRun, RunExchange } from "../modules/analysis/analysis-run.entity.js";
import type { AnalysisRunRepository } from "./repository.js";

interface AnalysisRunRow extends RowDataPacket {
  id: string;
  kind: AnalysisRun["kind"];
  comparison_source_ids: string | null;
  local_path: string;
  base_ref: string;
  current_ref: string;
  goal: string;
  lens: AnalysisRun["lens"] | null;
  verbosity: AnalysisRun["verbosity"] | null;
  focus_paths_json: string | string[] | null;
  notes: string | null;
  status: AnalysisRun["status"];
  project_summary_json: string | Record<string, unknown> | null;
  comparison_json: string | Record<string, unknown> | null;
  ai_report_json: string | Record<string, unknown> | null;
  ai_status: AnalysisRun["aiStatus"] | null;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
}

interface FindingRow extends RowDataPacket {
  analysis_run_id: string;
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  file_path: string;
  line_number: number | null;
  evidence_json: string | Record<string, unknown> | null;
}

interface ExchangeRow extends RowDataPacket {
  id: string;
  analysis_run_id: string;
  question: string;
  answer: string;
  citations_json: string | string[] | null;
  created_at: Date;
}

export class MySqlAnalysisRunRepository implements AnalysisRunRepository {
  constructor(private readonly pool: Pool) {}

  async save(run: AnalysisRun): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.upsertRun(connection, run);
      await connection.execute(
        "DELETE FROM findings WHERE analysis_run_id = ?",
        [run.id],
      );
      if (run.findings.length > 0) {
        const placeholders = run.findings.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
        const values = run.findings.flatMap((finding) => [
          run.id,
          finding.code,
          finding.severity,
          finding.message,
          finding.filePath,
          finding.line ?? null,
          finding.evidence === undefined ? null : JSON.stringify(finding.evidence),
        ]);
        await connection.query<ResultSetHeader>(
          `INSERT INTO findings
            (analysis_run_id, code, severity, message, file_path, line_number, evidence_json)
           VALUES ${placeholders}`,
          values,
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findById(id: string): Promise<AnalysisRun | null> {
    const [rows] = await this.pool.query<AnalysisRunRow[]>(
      "SELECT * FROM analysis_runs WHERE id = ?",
      [id],
    );
    const row = rows[0];
    if (row === undefined) return null;
    const findings = await this.loadFindings([row.id]);
    return this.hydrateRun(row, findings.get(row.id) ?? []);
  }

  async list(limit = 100): Promise<AnalysisRun[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const [rows] = await this.pool.query<AnalysisRunRow[]>(
      "SELECT * FROM analysis_runs ORDER BY created_at DESC LIMIT ?",
      [safeLimit],
    );
    if (rows.length === 0) return [];
    const findings = await this.loadFindings(rows.map((row) => row.id));
    return rows.map((row) => this.hydrateRun(row, findings.get(row.id) ?? []));
  }

  async markStaleRunningAsFailed(): Promise<number> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE analysis_runs SET status = 'failed', error_message = 'Server restarted before this run completed.', completed_at = NOW(3)
       WHERE status IN ('queued', 'running')`,
    );
    return result.affectedRows;
  }

  async appendExchange(runId: string, exchange: RunExchange): Promise<RunExchange[]> {
    await this.pool.execute(
      `INSERT INTO run_exchanges (id, analysis_run_id, question, answer, citations_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        exchange.id,
        runId,
        exchange.question,
        exchange.answer,
        JSON.stringify(exchange.citations),
      ],
    );
    return this.listExchanges(runId);
  }

  async listExchanges(runId: string): Promise<RunExchange[]> {
    const [rows] = await this.pool.query<ExchangeRow[]>(
      "SELECT * FROM run_exchanges WHERE analysis_run_id = ? ORDER BY created_at",
      [runId],
    );
    return rows.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      citations:
        row.citations_json === null
          ? []
          : typeof row.citations_json === "string"
            ? (JSON.parse(row.citations_json) as string[])
            : row.citations_json,
      createdAt: row.created_at.toISOString(),
    }));
  }

  private async upsertRun(connection: PoolConnection, run: AnalysisRun): Promise<void> {
    await connection.execute<ResultSetHeader>(
      `INSERT INTO analysis_runs
        (id, kind, comparison_source_ids, local_path, base_ref, current_ref, goal, lens, verbosity, focus_paths_json, notes, status,
         project_summary_json, comparison_json, ai_report_json, ai_status, error_message, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         project_summary_json = VALUES(project_summary_json),
         comparison_json = VALUES(comparison_json),
         ai_report_json = VALUES(ai_report_json),
         ai_status = VALUES(ai_status),
         error_message = VALUES(error_message),
         completed_at = VALUES(completed_at)`,
      [
        run.id,
        run.kind,
        run.comparisonSourceRunIds === undefined
          ? null
          : JSON.stringify(run.comparisonSourceRunIds),
        run.localPath,
        run.baseRef,
        run.currentRef,
        run.goal,
        run.lens ?? null,
        run.verbosity ?? null,
        run.focusPaths === undefined ? null : JSON.stringify(run.focusPaths),
        run.notes ?? null,
        run.status,
        run.projectSummary === undefined ? null : JSON.stringify(run.projectSummary),
        run.comparison === undefined ? null : JSON.stringify(run.comparison),
        run.aiReport === undefined ? null : JSON.stringify(run.aiReport),
        run.aiStatus ?? null,
        run.error ?? null,
        new Date(run.createdAt),
        run.completedAt === undefined ? null : new Date(run.completedAt),
      ],
    );
  }

  private async loadFindings(
    runIds: string[],
  ): Promise<Map<string, FindingRow[]>> {
    if (runIds.length === 0) return new Map();
    const placeholders = runIds.map(() => "?").join(", ");
    const [rows] = await this.pool.query<FindingRow[]>(
      `SELECT * FROM findings WHERE analysis_run_id IN (${placeholders}) ORDER BY id`,
      runIds,
    );
    const grouped = new Map<string, FindingRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.analysis_run_id) ?? [];
      list.push(row);
      grouped.set(row.analysis_run_id, list);
    }
    return grouped;
  }

  private hydrateRun(row: AnalysisRunRow, findingRows: FindingRow[]): AnalysisRun {
    return {
      id: row.id,
      kind: row.kind ?? "analysis",
      comparisonSourceRunIds: parseJsonColumn<[string, string]>(
        row.comparison_source_ids,
      ),
      localPath: row.local_path,
      baseRef: row.base_ref,
      currentRef: row.current_ref,
      goal: row.goal,
      status: row.status,
      lens: row.lens ?? undefined,
      verbosity: row.verbosity ?? undefined,
      focusPaths:
        row.focus_paths_json === null
          ? undefined
          : typeof row.focus_paths_json === "string"
            ? (JSON.parse(row.focus_paths_json) as string[])
            : row.focus_paths_json,
      notes: row.notes ?? undefined,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      projectSummary: parseJsonColumn<AnalysisRun["projectSummary"]>(
        row.project_summary_json,
      ),
      comparison: parseJsonColumn<AnalysisRun["comparison"]>(row.comparison_json),
      findings: findingRows.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        filePath: finding.file_path,
        line: finding.line_number ?? undefined,
        evidence: parseJsonColumn<Record<string, unknown>>(finding.evidence_json),
      })),
      aiReport: parseJsonColumn<Record<string, unknown>>(row.ai_report_json),
      aiStatus: row.ai_status ?? undefined,
      error: row.error_message ?? undefined,
    };
  }
}

function parseJsonColumn<T>(value: string | Record<string, unknown> | null): T | undefined {
  if (value === null) return undefined;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
