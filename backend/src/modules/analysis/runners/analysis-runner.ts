/**
 * Analysis-run background execution.
 *
 * Responsibility: run one queued analysis to completion — inspect, compare
 * revisions, materialize snapshots, run deterministic checks, run the AI
 * stage, persist the finished run. Called by AnalysisService via JobQueue.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { AppConfig } from "../../../config/env.js";
import { AppError } from "../../../shared/errors.js";
import { getLogger } from "../../../shared/logger.js";
import {
  buildAnalysisContext,
  type BuiltAnalysisContext,
} from "../../ai/context-builder.js";
import type { InseaWorkflowClient } from "../../ai/insea.client.js";
import { normalizeAiReport } from "../../ai/report-normalizer.js";
import type {
  AiStatus,
  AnalysisLens,
  AnalysisRun,
  Finding,
  Verbosity,
} from "../analysis-run.entity.js";
import type { AnalysisRunRepository } from "../../../persistence/repository.js";
import { compareGitRevisions } from "../../git/git-comparison.js";
import { materializeGitRevision } from "../../git/snapshot.store.js";
import { inspectLocalProject } from "../../projects/project.service.js";
import { auditCsvContent } from "../../configs/csv.auditor.js";
import {
  compareProjectConfigs,
  inferKeyColumns,
} from "../../configs/config-comparator.js";
import { parseCsvContent } from "../../configs/csv.parser.js";

export interface RunAiStageContext {
  analysisId: string;
  goal: string;
  lens?: AnalysisLens;
  verbosity?: Verbosity;
  notes?: string;
  focusPaths?: string[];
  baseRef: string;
  currentRef: string;
  baseInspection: Parameters<typeof buildAnalysisContext>[0]["baseInspection"];
  currentInspection: Parameters<typeof buildAnalysisContext>[0]["currentInspection"];
  comparison: Parameters<typeof buildAnalysisContext>[0]["comparison"];
  deterministicFindings: Finding[];
}

export async function executeAnalysisRun(
  repository: AnalysisRunRepository,
  config: AppConfig,
  aiClient: InseaWorkflowClient | null,
  runId: string,
): Promise<void> {
  const stored = await repository.findById(runId);
  if (stored === null || stored.status !== "queued") return;
  await repository.save({ ...stored, status: "running" });

  try {
    const inspection = await inspectLocalProject(stored.localPath, {
      allowedRoots: config.analyzedRoots,
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

      const { aiReport, aiStatus } = await runAiStage(config, aiClient, {
        analysisId: stored.id,
        goal: stored.goal,
        lens: stored.lens,
        verbosity: stored.verbosity,
        notes: stored.notes,
        focusPaths: stored.focusPaths,
        baseRef: stored.baseRef,
        currentRef: stored.currentRef,
        baseInspection,
        currentInspection,
        comparison,
        deterministicFindings,
      });

      await repository.save({
        ...stored,
        status: "completed",
        completedAt: new Date().toISOString(),
        projectSummary: currentInspection.summary,
        comparison: {
          baseCommit: comparison.baseCommit,
          currentCommit: comparison.currentCommit,
          currentIsWorktree: comparison.currentIsWorktree,
          changedFiles: comparison.changedFiles,
          unifiedDiff: comparison.unifiedDiff,
          diffTruncated: comparison.diffTruncated,
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
    const failed = await repository.findById(runId);
    if (failed !== null) {
      await repository.save({
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

export async function runAiStage(
  config: AppConfig,
  aiClient: InseaWorkflowClient | null,
  context: RunAiStageContext,
): Promise<{ aiReport?: Record<string, unknown>; aiStatus: AiStatus }> {
  if (aiClient === null || config.ai.configured === false) {
    return { aiStatus: "not_configured" };
  }
  try {
    const built: BuiltAnalysisContext = await buildAnalysisContext({
      analysisId: context.analysisId,
      requestId: randomUUID(),
      goal: context.goal,
      lens: context.lens,
      verbosity: context.verbosity,
      notes: context.notes,
      focusPaths: context.focusPaths,
      baseRef: context.baseRef,
      currentRef: context.currentRef,
      baseInspection: context.baseInspection,
      currentInspection: context.currentInspection,
      comparison: context.comparison,
      deterministicFindings: context.deterministicFindings,
      maxFiles: config.ai.maxFiles,
      maxBytes: config.ai.maxContextBytes,
    });
    const aiReport = normalizeAiReport(
      await aiClient.run(built.workflowInput),
    );
    return { aiReport, aiStatus: "completed" };
  } catch (error) {
    getLogger().warn({ err: error }, "AI stage failed, keeping deterministic results");
    return { aiStatus: "failed" };
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

export type { AnalysisRun };
