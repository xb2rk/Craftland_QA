/**
 * Analysis service facade.
 *
 * Responsibility: own run lifecycle (queue, persist, delegate). The heavy
 * work lives in focused submodules:
 * - ./runners/analysis-runner.ts — background analysis execution + AI stage
 * - ./runners/comparison-runner.ts — deterministic A/B comparison runs
 * - ./questions/question-answerer.ts — follow-up Q&A over completed runs
 * - ./whatif/whatif-runner.ts — hypothetical single-cell config edits
 * - ./runs/run-importer.ts — imported run payloads
 *
 * HTTP routes and tests depend on this class's public API; keep method
 * signatures stable when refactoring the submodules.
 */
import { randomUUID } from "node:crypto";

import type { AppConfig } from "../../config/env.js";
import { NotFoundError } from "../../shared/errors.js";
import type { InseaWorkflowClient } from "../ai/insea.client.js";
import type {
  AnalysisLens,
  AnalysisRun,
  RunExchange,
  Verbosity,
  WhatIfResult,
} from "./analysis-run.entity.js";
import { compareGitRevisions } from "../git/git-comparison.js";
import { inspectLocalProject } from "../projects/project.service.js";
import type { AnalysisRunRepository } from "../../persistence/repository.js";
import { JobQueue } from "./job-queue.js";
import { executeAnalysisRun } from "./runners/analysis-runner.js";
import { executeComparisonRun } from "./runners/comparison-runner.js";
import {
  answerRunQuestion,
  listRunExchanges,
} from "./questions/question-answerer.js";
import {
  runWhatIfAnalysis,
  type RunWhatIfInput,
} from "./whatif/whatif-runner.js";
import { importAnalysisRun } from "./runs/run-importer.js";
import {
  draftWriterOutput,
  type DraftWriterInput,
  type WriterDraft,
} from "../writers/writer.service.js";
import {
  runLocalizationCheck,
  type LocalizationCheckOutput,
  type RunLocalizationInput,
} from "../localization/localization.service.js";

export interface CreateAnalysisInput {
  localPath: string;
  baseRef: string;
  currentRef: string;
  goal: string;
  lens?: AnalysisLens;
  verbosity?: Verbosity;
  focusPaths?: string[];
  notes?: string;
}

export interface ProjectDiffInput {
  localPath: string;
  baseRef: string;
  currentRef: string;
}

export interface WhatIfInput extends RunWhatIfInput {}

export interface AskQuestionInput {
  analysisRunId: string;
  question: string;
}

export interface CompareAnalysesInput {
  analysisRunAId: string;
  analysisRunBId: string;
  goal: string;
}

export interface DraftWriterRequest extends DraftWriterInput {}

export interface RunLocalizationRequest extends RunLocalizationInput {}

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
      lens: input.lens ?? "pre_merge",
      verbosity: input.verbosity ?? "auto",
      focusPaths: input.focusPaths ?? [],
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    await this.repository.save(run);
    this.queue.enqueue(`analysis:${run.id}`, () =>
      executeAnalysisRun(this.repository, this.config, this.aiClient, run.id),
    );
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
      executeComparisonRun(this.repository, comparisonRun.id),
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

  askQuestion(input: AskQuestionInput): Promise<RunExchange> {
    return answerRunQuestion(
      {
        repository: this.repository,
        config: this.config,
        aiClient: this.aiClient,
      },
      input,
    );
  }

  listExchanges(analysisRunId: string): Promise<RunExchange[]> {
    return listRunExchanges(this.repository, analysisRunId);
  }

  async diffProject(
    input: ProjectDiffInput,
  ): Promise<NonNullable<AnalysisRun["comparison"]>> {
    const inspection = await inspectLocalProject(input.localPath, {
      allowedRoots: this.config.analyzedRoots,
    });
    const comparison = await compareGitRevisions(
      inspection.rootPath,
      input.baseRef,
      input.currentRef,
    );
    return {
      baseCommit: comparison.baseCommit,
      currentCommit: comparison.currentCommit,
      currentIsWorktree: comparison.currentIsWorktree,
      changedFiles: comparison.changedFiles,
      unifiedDiff: comparison.unifiedDiff,
      diffTruncated: comparison.diffTruncated,
    };
  }

  runWhatIf(input: WhatIfInput): Promise<WhatIfResult> {
    return runWhatIfAnalysis(
      {
        repository: this.repository,
        config: this.config,
        aiClient: this.aiClient,
      },
      input,
    );
  }

  importRun(raw: Record<string, unknown>): Promise<AnalysisRun> {
    return importAnalysisRun(this.repository, raw);
  }

  draftWriter(input: DraftWriterRequest): Promise<WriterDraft> {
    return draftWriterOutput(
      { config: this.config, aiClient: this.aiClient },
      input,
    );
  }

  runLocalization(input: RunLocalizationRequest): Promise<LocalizationCheckOutput> {
    return runLocalizationCheck(
      { config: this.config, aiClient: this.aiClient },
      input,
    );
  }
}
