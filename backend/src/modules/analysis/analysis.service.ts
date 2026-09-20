import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { AppConfig } from "../../config/env.js";
import { AppError, NotFoundError } from "../../shared/errors.js";
import { getLogger } from "../../shared/logger.js";
import {
  buildAnalysisContext,
  type BuiltAnalysisContext,
} from "../ai/context-builder.js";
import { InseaWorkflowClient } from "../ai/insea.client.js";
import type {
  AnalysisRun,
  AiStatus,
  Finding,
} from "./analysis-run.entity.js";
import { compareGitRevisions } from "../git/git-comparison.js";
import { materializeGitRevision } from "../git/snapshot.store.js";
import { inspectLocalProject } from "../projects/project.service.js";
import { auditCsvContent } from "../configs/csv.auditor.js";
import {
  compareProjectConfigs,
  inferKeyColumns,
} from "../configs/config-comparator.js";
import { parseCsvContent } from "../configs/csv.parser.js";
import type { AnalysisRunRepository } from "../../persistence/repository.js";
import { JobQueue } from "./job-queue.js";

export interface CreateAnalysisInput {
  localPath: string;
  baseRef: string;
  currentRef: string;
  goal: string;
}

export interface CompareAnalysesInput {
  analysisRunAId: string;
  analysisRunBId: string;
  goal: string;
}

export class AnalysisService {
  private readonly queue = new JobQueue();

  constructor(
    private readonly repository: AnalysisRunRepository,
    private readonly config: AppConfig,
    private readonly aiClient: InseaWorkflowClient | null,
  ) {}

  async create(input: CreateAnalysisInput): Promise<AnalysisRun> {
    const run: AnalysisRun = {
      id: randomUUID(),
      kind: "analysis",
      localPath: input.localPath,
      baseRef: input.baseRef,
      currentRef: input.currentRef,
      goal: input.goal,
      status: "queued",
      createdAt: new Date().toISOString(),
      findings: [],
    };
    await this.repository.save(run);
    this.queue.enqueue(`analysis:${run.id}`, () => this.executeAnalysis(run.id));
    return {
      ...(await this.repository.findById(run.id))!,
    };
  }

  async compare(input: CompareAnalysesInput): Promise<AnalysisRun> {
    const [runA, runB] = await Promise.all([
      this.repository.findById(input.analysisRunAId),
      this.repository.findById(input.analysisRunBId),
    ]);
    if (runA === null || runA.status !== "completed") {
      throw new NotFoundError(
        "ANALYSIS_RUN_NOT_FOUND",
        "First analysis run was not found or is not completed.",
      );
    }
    if (runB === null || runB.status !== "completed") {
      throw new NotFoundError(
        "ANALYSIS_RUN_NOT_FOUND",
        "Second analysis run was not found or is not completed.",
      );
    }
    const comparisonRun: AnalysisRun = {
      id: randomUUID(),
      kind: "comparison",
      comparisonSourceRunIds: [runA.id, runB.id],
      localPath: runB.localPath,
      baseRef: runA.currentRef,
      currentRef: runB.currentRef,
      goal: input.goal,
      status: "queued",
      createdAt: new Date().toISOString(),
      findings: [],
    };
    await this.repository.save(comparisonRun);
    this.queue.enqueue(`comparison:${comparisonRun.id}`, () =>
      this.executeComparison(comparisonRun.id),
    );
    return {
      ...(await this.repository.findById(comparisonRun.id))!,
    };
  }

  findById(id: string): Promise<AnalysisRun | null> {
    return this.repository.findById(id);
  }

  list(limit?: number): Promise<AnalysisRun[]> {
    return this.repository.list(limit);
  }

  getPendingCount(): number {
    return this.queue.getPendingCount();
  }

  private async executeAnalysis(runId: string): Promise<void> {
    const stored = await this.repository.findById(runId);
    if (stored === null || stored.status !== "queued") return;
    await this.repository.save({ ...stored, status: "running" });

    try {
      const inspection = await inspectLocalProject(stored.localPath, {
        allowedRoots: this.config.analyzedRoots,
      });
      const comparison = await compareGitRevisions(
        inspection.rootPath,
        stored.baseRef,
        stored.currentRef,
      );

      let baseInspection = inspection;
      let currentInspection = inspection;
      const cleanups: Array<() => Promise<void>> = [];
      try {
        if (!comparison.currentIsWorktree || comparison.baseCommit !== comparison.currentCommit) {
          const baseSnapshot = await materializeGitRevision(
            inspection,
            comparison.baseCommit,
          );
          cleanups.push(baseSnapshot.cleanup);
          baseInspection = baseSnapshot.inspection;
          if (!comparison.currentIsWorktree) {
            const currentSnapshot = await materializeGitRevision(
              inspection,
              comparison.currentCommit,
            );
            cleanups.push(currentSnapshot.cleanup);
            currentInspection = currentSnapshot.inspection;
          }
        }

        const csvFindings = await auditInspections(baseInspection, currentInspection);
        const configFindings = await compareProjectConfigs(
          baseInspection,
          currentInspection,
          comparison.changedFiles,
        );
        const deterministicFindings: Finding[] = [...csvFindings, ...configFindings];

        const { aiReport, aiStatus } = await this.runAiStage({
          analysisId: stored.id,
          goal: stored.goal,
          baseRef: stored.baseRef,
          currentRef: stored.currentRef,
          baseInspection,
          currentInspection,
          comparison,
          deterministicFindings,
        });

        await this.repository.save({
          ...stored,
          status: "completed",
          completedAt: new Date().toISOString(),
          projectSummary: currentInspection.summary,
          comparison: {
            baseCommit: comparison.baseCommit,
            currentCommit: comparison.currentCommit,
            currentIsWorktree: comparison.currentIsWorktree,
            changedFiles: comparison.changedFiles,
          },
          findings: deterministicFindings,
          aiReport,
          aiStatus,
        });
      } finally {
        await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
      }
    } catch (error) {
      getLogger().error({ err: error, runId }, "analysis run failed");
      const failed = await this.repository.findById(runId);
      if (failed !== null) {
        await this.repository.save({
          ...failed,
          status: "failed",
          completedAt: new Date().toISOString(),
          error:
            error instanceof AppError
              ? error.message
              : "Analysis run failed unexpectedly.",
        });
      }
    }
  }

  private async executeComparison(runId: string): Promise<void> {
    const stored = await this.repository.findById(runId);
    if (
      stored === null ||
      stored.status !== "queued" ||
      stored.comparisonSourceRunIds === undefined
    ) {
      return;
    }
    await this.repository.save({ ...stored, status: "running" });
    try {
      const [runA, runB] = await Promise.all([
        this.repository.findById(stored.comparisonSourceRunIds[0]),
        this.repository.findById(stored.comparisonSourceRunIds[1]),
      ]);
      if (
        runA?.comparison === undefined ||
        runB?.comparison === undefined ||
        runA.status !== "completed" ||
        runB.status !== "completed"
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          400,
          "Both source runs must be completed analyses with comparisons.",
        );
      }

      const findings: Finding[] = [
        ...summarizeRunDelta("A", runA),
        ...summarizeRunDelta("B", runB),
        ...diffFindings(runA.findings, runB.findings),
      ];

      await this.repository.save({
        ...stored,
        status: "completed",
        completedAt: new Date().toISOString(),
        projectSummary: runB.projectSummary,
        comparison: runB.comparison,
        findings,
        aiReport: {
          schema_version: "1.0",
          stage: "comparison",
          status: "completed",
          summary: {
            overall_assessment: `Compared ${runA.id} against ${runB.id}.`,
            risk_level: "unknown",
            confidence: "low",
            change_scope: "unknown",
          },
          source_runs: [runA.id, runB.id],
          goal: stored.goal,
        },
        aiStatus: "skipped",
      });
    } catch (error) {
      getLogger().error({ err: error, runId }, "comparison run failed");
      const failed = await this.repository.findById(runId);
      if (failed !== null) {
        await this.repository.save({
          ...failed,
          status: "failed",
          completedAt: new Date().toISOString(),
          error:
            error instanceof AppError
              ? error.message
              : "Comparison run failed unexpectedly.",
        });
      }
    }
  }

  private async runAiStage(context: {
    analysisId: string;
    goal: string;
    baseRef: string;
    currentRef: string;
    baseInspection: Parameters<typeof buildAnalysisContext>[0]["baseInspection"];
    currentInspection: Parameters<typeof buildAnalysisContext>[0]["currentInspection"];
    comparison: Parameters<typeof buildAnalysisContext>[0]["comparison"];
    deterministicFindings: Finding[];
  }): Promise<{ aiReport?: Record<string, unknown>; aiStatus: AiStatus }> {
    if (this.aiClient === null || this.config.ai.configured === false) {
      return { aiStatus: "not_configured" };
    }
    try {
      const built: BuiltAnalysisContext = await buildAnalysisContext({
        analysisId: context.analysisId,
        requestId: randomUUID(),
        goal: context.goal,
        baseRef: context.baseRef,
        currentRef: context.currentRef,
        baseInspection: context.baseInspection,
        currentInspection: context.currentInspection,
        comparison: context.comparison,
        deterministicFindings: context.deterministicFindings,
        maxFiles: this.config.ai.maxFiles,
        maxBytes: this.config.ai.maxContextBytes,
      });
      const aiReport = await this.aiClient.run(built.workflowInput);
      return { aiReport, aiStatus: "completed" };
    } catch (error) {
      getLogger().warn({ err: error }, "AI stage failed, keeping deterministic results");
      return { aiStatus: "failed" };
    }
  }
}

async function auditInspections(
  baseInspection: Parameters<typeof compareProjectConfigs>[0],
  currentInspection: Parameters<typeof compareProjectConfigs>[1],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const inspection of [baseInspection, currentInspection]) {
    for (const file of inspection.files) {
      if (file.kind !== "config" || file.extension !== ".csv") continue;
      const content = await readFile(file.absolutePath, "utf8");
      const header = parseCsvContent(content)[0] ?? [];
      const dataRows = parseCsvContent(content).slice(2);
      findings.push(
        ...auditCsvContent(content, {
          filePath: file.relativePath,
          keyColumns: inferKeyColumns(header, dataRows),
        }).findings,
      );
    }
  }
  return findings;
}

function summarizeRunDelta(label: "A" | "B", run: AnalysisRun): Finding[] {
  return [
    {
      code: "COMPARISON_SOURCE_SUMMARY",
      severity: "info",
      message: `Run ${label} (${run.id.slice(0, 8)}): ${run.findings.length} findings, ${run.comparison?.changedFiles.length ?? 0} changed files.`,
      filePath: "<comparison>",
      evidence: {
        source: label,
        runId: run.id,
        findingCount: run.findings.length,
        changedFiles: run.comparison?.changedFiles.length ?? 0,
      },
    },
  ];
}

function diffFindings(left: Finding[], right: Finding[]): Finding[] {
  const key = (finding: Finding) =>
    `${finding.code}${finding.filePath}${finding.line ?? ""}${finding.message}`;
  const leftKeys = new Set(left.map(key));
  const rightKeys = new Set(right.map(key));
  const findings: Finding[] = [];
  for (const finding of right) {
    if (!leftKeys.has(key(finding))) {
      findings.push({ ...finding, filePath: finding.filePath });
    }
  }
  for (const finding of left) {
    if (!rightKeys.has(key(finding))) {
      findings.push({
        code: "COMPARISON_FINDING_REMOVED",
        severity: "info",
        message: `No longer reported in B: ${finding.message}`,
        filePath: finding.filePath,
        line: finding.line,
        evidence: { originalCode: finding.code },
      });
    }
  }
  void rightKeys;
  return findings;
}
