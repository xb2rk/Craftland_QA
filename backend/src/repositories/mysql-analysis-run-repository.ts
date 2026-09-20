import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket
} from "mysql2/promise";

import type { AnalysisRun } from "../domain/analysis-run.js";
import type { AnalysisRunRepository } from "./analysis-run-repository.js";

interface AnalysisRunRow extends RowDataPacket {
  id: string;
  local_path: string;
  base_ref: string;
  current_ref: string;
  goal: string;
  status: AnalysisRun["status"];
  summary_json: string | Record<string, unknown> | null;
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

export class MySqlAnalysisRunRepository
  implements AnalysisRunRepository
{
  constructor(private readonly pool: Pool) {}

  async save(run: AnalysisRun): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.upsertRun(connection, run);
      await connection.execute(
        "DELETE FROM findings WHERE analysis_run_id = ?",
        [run.id]
      );
      for (const finding of run.findings) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO findings
            (analysis_run_id, source, code, severity, message, file_path,
             line_number, evidence_json)
           VALUES (?, 'deterministic', ?, ?, ?, ?, ?, ?)`,
          [
            run.id,
            finding.code,
            finding.severity,
            finding.message,
            finding.filePath,
            finding.line ?? null,
            finding.evidence === undefined
              ? null
              : JSON.stringify(finding.evidence)
          ]
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
      [id]
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return this.hydrateRun(row);
  }

  async list(): Promise<AnalysisRun[]> {
    const [rows] = await this.pool.query<AnalysisRunRow[]>(
      "SELECT * FROM analysis_runs ORDER BY created_at DESC LIMIT 100"
    );
    return Promise.all(rows.map((row) => this.hydrateRun(row)));
  }

  private async upsertRun(
    connection: PoolConnection,
    run: AnalysisRun
  ): Promise<void> {
    await connection.execute<ResultSetHeader>(
      `INSERT INTO analysis_runs
        (id, local_path, base_ref, current_ref, goal, status, summary_json,
         ai_report_json, ai_status, error_message, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         summary_json = VALUES(summary_json),
         ai_report_json = VALUES(ai_report_json),
         ai_status = VALUES(ai_status),
         error_message = VALUES(error_message),
         completed_at = VALUES(completed_at)`,
      [
        run.id,
        run.localPath,
        run.baseRef,
        run.currentRef,
        run.goal,
        run.status,
        run.projectSummary === undefined &&
        run.comparison === undefined &&
        run.kind === undefined &&
        run.comparisonSourceRunIds === undefined
          ? null
          : JSON.stringify({
              projectSummary: run.projectSummary,
              comparison: run.comparison,
              kind: run.kind,
              comparisonSourceRunIds: run.comparisonSourceRunIds
            }),
        run.aiReport === undefined ? null : JSON.stringify(run.aiReport),
        run.aiStatus ?? null,
        run.error ?? null,
        new Date(run.createdAt),
        run.completedAt === undefined ? null : new Date(run.completedAt)
      ]
    );
  }

  private async hydrateRun(row: AnalysisRunRow): Promise<AnalysisRun> {
    const [findingRows] = await this.pool.query<FindingRow[]>(
      "SELECT * FROM findings WHERE analysis_run_id = ? ORDER BY id",
      [row.id]
    );
    const summary = parseJsonColumn<{
      projectSummary?: AnalysisRun["projectSummary"];
      comparison?: AnalysisRun["comparison"];
      kind?: AnalysisRun["kind"];
      comparisonSourceRunIds?: AnalysisRun["comparisonSourceRunIds"];
    }>(row.summary_json);
    return {
      id: row.id,
      localPath: row.local_path,
      baseRef: row.base_ref,
      currentRef: row.current_ref,
      goal: row.goal,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      projectSummary: summary?.projectSummary,
      comparison: summary?.comparison,
      kind: summary?.kind,
      comparisonSourceRunIds: summary?.comparisonSourceRunIds,
      findings: findingRows.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        filePath: finding.file_path,
        line: finding.line_number ?? undefined,
        evidence: parseJsonColumn<Record<string, unknown>>(
          finding.evidence_json
        )
      })),
      aiReport: parseJsonColumn<Record<string, unknown>>(
        row.ai_report_json
      ),
      aiStatus: row.ai_status ?? undefined,
      error: row.error_message ?? undefined
    };
  }
}

function parseJsonColumn<T>(
  value: string | Record<string, unknown> | null
): T | undefined {
  if (value === null) {
    return undefined;
  }
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
