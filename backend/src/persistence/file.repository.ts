/**
 * File-backed analysis-run repository.
 *
 * Responsibility: durable local persistence without a database — one JSON
 * document per run under `<storeDir>/runs/<id>.json`, written atomically via
 * a temp file plus rename. Run IDs are allowlisted so route parameters can
 * never escape the store directory. Corrupt documents are skipped by list()
 * but surface on direct reads.
 */
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AnalysisRun,
  RunExchange,
} from "../modules/analysis/analysis-run.entity.js";
import type { AnalysisRunRepository } from "./repository.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
let tmpCounter = 0;

export class FileAnalysisRunRepository implements AnalysisRunRepository {
  private readonly runsDir: string;

  constructor(storeDir: string) {
    this.runsDir = path.join(storeDir, "runs");
  }

  private filePath(id: string): string {
    if (!ID_PATTERN.test(id)) {
      throw new Error(`Invalid analysis run id: ${id}`);
    }
    return path.join(this.runsDir, `${id}.json`);
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.runsDir, { recursive: true });
  }

  private async readRun(id: string): Promise<AnalysisRun | null> {
    if (!ID_PATTERN.test(id)) return null;
    let raw: string;
    try {
      raw = await readFile(this.filePath(id), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    }
    const run = JSON.parse(raw) as AnalysisRun;
    if (typeof run !== "object" || run === null || run.id !== id) return null;
    return run;
  }

  async save(run: AnalysisRun): Promise<void> {
    await this.ensureDir();
    const target = this.filePath(run.id);
    tmpCounter += 1;
    const tmp = `${target}.${process.pid}.${tmpCounter}.tmp`;
    await writeFile(tmp, JSON.stringify(run), "utf8");
    await rename(tmp, target);
  }

  async findById(id: string): Promise<AnalysisRun | null> {
    const run = await this.readRun(id);
    return run ? structuredClone(run) : null;
  }

  async list(limit = 100): Promise<AnalysisRun[]> {
    await this.ensureDir();
    const entries = await readdir(this.runsDir);
    const runs: AnalysisRun[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const run = await this.readRun(entry.slice(0, -".json".length));
        if (run) runs.push(run);
      } catch {
        continue;
      }
    }
    return runs
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((run) => structuredClone(run));
  }

  async appendExchange(runId: string, exchange: RunExchange): Promise<RunExchange[]> {
    const run = await this.readRun(runId);
    if (run === null) return [];
    const exchanges = [...(run.exchanges ?? []), structuredClone(exchange)];
    await this.save({ ...run, exchanges });
    return structuredClone(exchanges);
  }

  async listExchanges(runId: string): Promise<RunExchange[]> {
    const run = await this.readRun(runId);
    return run?.exchanges ? structuredClone(run.exchanges) : [];
  }

  /** Mark stale queued/running runs as failed after a restart. */
  async markStaleRunningAsFailed(): Promise<number> {
    await this.ensureDir();
    const entries = await readdir(this.runsDir);
    let count = 0;
    const completedAt = new Date().toISOString();
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const run = await this.readRun(entry.slice(0, -".json".length));
      if (run === null) continue;
      if (run.status === "queued" || run.status === "running") {
        await this.save({
          ...run,
          status: "failed",
          completedAt,
          error: "Server restarted before this run completed.",
        });
        count += 1;
      }
    }
    return count;
  }
}
