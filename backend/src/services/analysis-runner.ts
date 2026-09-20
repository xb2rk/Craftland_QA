import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { AnalysisRun } from "../domain/analysis-run.js";
import { auditCsvContent } from "../domain/csv-auditor.js";
import type { Finding } from "../domain/finding.js";
import type { AnalysisRunRepository } from "../repositories/analysis-run-repository.js";
import { compareProjectConfigs } from "./config-comparison.js";
import { buildAnalysisContext } from "./ai/analysis-context-builder.js";
import type { InseaWorkflowClient } from "./ai/insea-workflow-client.js";
import {
  compareGitRevisions,
  type GitComparison
} from "./git-comparison.js";
import { materializeGitRevision } from "./git-revision-snapshot.js";
import {
  inspectLocalProject,
  type ProjectInspection
} from "./project-inspector.js";

export interface CreateAnalysisRunInput {
  localPath: string;
  baseRef: string;
  currentRef: string;
  goal: string;
}

export interface AnalysisRunnerOptions {
  inspectProject?: (localPath: string) => Promise<ProjectInspection>;
  compareRevisions?: (
    rootPath: string,
    baseRef: string,
    currentRef: string
  ) => Promise<GitComparison>;
  aiClient?: Pick<InseaWorkflowClient, "run">;
  maxAiFiles?: number;
  maxAiBytes?: number;
}

export class AnalysisRunner {
  private readonly inspectProject: (
    localPath: string
  ) => Promise<ProjectInspection>;
  private readonly compareRevisions: (
    rootPath: string,
    baseRef: string,
    currentRef: string
  ) => Promise<GitComparison>;

  constructor(
    private readonly repository: AnalysisRunRepository,
    private readonly options: AnalysisRunnerOptions = {}
  ) {
    this.inspectProject = options.inspectProject ?? inspectLocalProject;
    this.compareRevisions = options.compareRevisions ?? compareGitRevisions;
  }

  async create(input: CreateAnalysisRunInput): Promise<AnalysisRun> {
    const now = new Date().toISOString();
    const run: AnalysisRun = {
      id: randomUUID(),
      kind: "analysis",
      localPath: input.localPath,
      baseRef: input.baseRef,
      currentRef: input.currentRef,
      goal: input.goal,
      status: "queued",
      createdAt: now,
      findings: []
    };
    await this.repository.save(run);
    queueMicrotask(() => {
      void this.execute(run, input);
    });
    return run;
  }

  private async execute(
    queuedRun: AnalysisRun,
    input: CreateAnalysisRunInput
  ): Promise<void> {
    const run: AnalysisRun = {
      ...queuedRun,
      status: "running"
    };
    await this.repository.save(run);
    const cleanupRevisionSnapshots: Array<() => Promise<void>> = [];
    try {
      const worktreeInspection = await this.inspectProject(input.localPath);
      const comparison = await this.compareRevisions(
        worktreeInspection.rootPath,
        input.baseRef,
        input.currentRef
      );
      const baseSnapshot = await materializeGitRevision(
        worktreeInspection,
        comparison.baseCommit,
        {
          includePaths: comparison.changedFiles
            .filter(
              (file) =>
                file.changeType !== "added" &&
                file.changeType !== "untracked"
            )
            .map((file) => file.previousPath ?? file.relativePath)
        }
      );
      cleanupRevisionSnapshots.push(baseSnapshot.cleanup);
      let currentInspection = worktreeInspection;
      if (!comparison.currentIsWorktree) {
        const snapshot = await materializeGitRevision(
          worktreeInspection,
          comparison.currentCommit,
          {
            includePaths: comparison.changedFiles
              .filter((file) => file.changeType !== "deleted")
              .map((file) => file.relativePath)
          }
        );
        currentInspection = snapshot.inspection;
        cleanupRevisionSnapshots.push(snapshot.cleanup);
      }
      const [currentFindings, configChanges] = await Promise.all([
        auditProjectCsvFiles(currentInspection),
        compareProjectConfigs(
          baseSnapshot.inspection,
          currentInspection,
          comparison.changedFiles
        )
      ]);
      const findings = [...configChanges, ...currentFindings];
      const aiResult = await this.runAiAnalysis(
        run.id,
        input,
        baseSnapshot.inspection,
        currentInspection,
        comparison,
        findings
      );
      const completed: AnalysisRun = {
        ...run,
        status: "completed",
        completedAt: new Date().toISOString(),
        projectSummary: currentInspection.summary,
        comparison: {
          baseCommit: comparison.baseCommit,
          currentCommit: comparison.currentCommit,
          currentIsWorktree: comparison.currentIsWorktree,
          changedFiles: comparison.changedFiles
        },
        findings,
        aiReport: aiResult.report,
        aiStatus: aiResult.status
      };
      await this.repository.save(completed);
    } catch (error) {
      const failed: AnalysisRun = {
        ...run,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      };
      await this.repository.save(failed);
    } finally {
      for (const cleanup of cleanupRevisionSnapshots.reverse()) {
        try {
          await cleanup();
        } catch {
          // Analysis result is already persisted; temp cleanup can be retried
          // by the operating system without changing the run outcome.
        }
      }
    }
  }

  findById(id: string): Promise<AnalysisRun | null> {
    return this.repository.findById(id);
  }

  list(): Promise<AnalysisRun[]> {
    return this.repository.list();
  }

  private async runAiAnalysis(
    analysisId: string,
    input: CreateAnalysisRunInput,
    baseInspection: ProjectInspection,
    currentInspection: ProjectInspection,
    comparison: GitComparison,
    findings: Finding[]
  ): Promise<{
    status: NonNullable<AnalysisRun["aiStatus"]>;
    report?: Record<string, unknown>;
  }> {
    if (this.options.aiClient === undefined) {
      return { status: "not_configured" };
    }

    const context = buildAnalysisContext({
      analysisId,
      goal: input.goal,
      baseRef: input.baseRef,
      currentRef: input.currentRef,
      baseInspection,
      currentInspection,
      comparison,
      deterministicFindings: findings,
      maxFiles: this.options.maxAiFiles,
      maxBytes: this.options.maxAiBytes
    });
    if (context.selectedFileCount === 0) {
      return { status: "skipped" };
    }

    try {
      return {
        status: "completed",
        report: await this.options.aiClient.run(context.workflowInput)
      };
    } catch (error) {
      return {
        status: "failed",
        report: {
          schema_version: "1.0",
          stage: "impact_analysis",
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}

async function auditProjectCsvFiles(
  inspection: ProjectInspection
): Promise<Finding[]> {
  const csvFiles = inspection.files.filter(
    (file) => file.extension === ".csv" && file.kind === "config"
  );
  const findings: Finding[] = [];

  for (const file of csvFiles) {
    const content = await readFile(file.absolutePath, "utf8");
    const audit = auditCsvContent(content, {
      filePath: file.relativePath,
      keyColumns: inferKeyColumns(file.relativePath)
    });
    findings.push(...audit.findings);
  }
  return findings;
}

function inferKeyColumns(filePath: string): string[] {
  const fileName = filePath.split("/").at(-1)?.toLowerCase();
  if (fileName === "breaktierdata.csv" || fileName === "mergetierdata.csv") {
    return ["Tier", "Order"];
  }
  const idKeyedFiles = new Set([
    "activeskilldata.csv",
    "bossdata.csv",
    "consumabledata.csv",
    "itemdata.csv",
    "materialdata.csv",
    "mutationdata.csv",
    "passiveskilldata.csv",
    "plantdata.csv",
    "seeddata.csv",
    "zombiedata.csv"
  ]);
  if (fileName !== undefined && idKeyedFiles.has(fileName)) {
    return ["Id"];
  }
  if (fileName === "plantattackvisualdata.csv") {
    return ["PlantId"];
  }
  if (fileName === "seedpooldata.csv") {
    return ["SeedPoolId"];
  }
  if (fileName === "shopdata.csv") {
    return ["ShopId"];
  }
  if (fileName === "upgradedata.csv") {
    return ["UpgradeType"];
  }
  if (fileName === "elementdata.csv") {
    return ["Element"];
  }
  return [];
}
