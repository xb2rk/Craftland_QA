/**
 * Follow-up Q&A over a completed run.
 *
 * Responsibility: validate run/AI preconditions, build the digest prompt,
 * call the AI workflow once, validate the answer shape, and persist the
 * exchange. Called by AnalysisService; no HTTP or queue concerns here.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { AppConfig } from "../../../config/env.js";
import { AppError, NotFoundError } from "../../../shared/errors.js";
import { getLogger } from "../../../shared/logger.js";
import type { InseaWorkflowClient } from "../../ai/insea.client.js";
import { buildFollowupPrompt } from "../../ai/prompt.builder.js";
import type { RunExchange } from "../analysis-run.entity.js";
import type { AnalysisRunRepository } from "../../../persistence/repository.js";

export interface AnswerQuestionDeps {
  repository: AnalysisRunRepository;
  config: AppConfig;
  aiClient: InseaWorkflowClient | null;
}

export interface AnswerQuestionInput {
  analysisRunId: string;
  question: string;
}

const followupAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8000),
  citations: z.array(z.string().trim().min(1).max(1024)).optional().default([]),
});

export async function answerRunQuestion(
  deps: AnswerQuestionDeps,
  input: AnswerQuestionInput,
): Promise<RunExchange> {
  const run = await deps.repository.findById(input.analysisRunId);
  if (run === null) {
    throw new NotFoundError("ANALYSIS_RUN_NOT_FOUND", "Analysis run was not found.");
  }
  if (run.status !== "completed") {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Questions are available once the run completes.",
    );
  }
  if (deps.aiClient === null || deps.config.ai.configured === false) {
    throw new AppError(
      "AI_NOT_CONFIGURED",
      400,
      "AI workflow is not configured; deterministic results only.",
    );
  }
  const history = await deps.repository.listExchanges(run.id);
  const report = (run.aiReport ?? {}) as Record<string, unknown>;
  const summary = (report.summary ?? {}) as Record<string, unknown>;
  const prompt = buildFollowupPrompt({
    goal: run.goal,
    lens: run.lens,
    question: input.question,
    history: history.map((exchange) => ({
      question: exchange.question,
      answer: exchange.answer,
    })),
    digest: {
      baseRef: run.baseRef,
      currentRef: run.currentRef,
      changedFiles: (run.comparison?.changedFiles ?? []).map((file) => ({
        relativePath: file.relativePath,
        changeType: file.changeType,
      })),
      findingCount: run.findings.length,
      deterministicFindings: run.findings.slice(0, 40).map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        filePath: finding.filePath,
        line: finding.line,
      })),
      aiAssessment:
        typeof summary.overall_assessment === "string"
          ? summary.overall_assessment
          : "No AI assessment.",
    },
  });
  let raw: Record<string, unknown>;
  try {
    raw = await deps.aiClient.run({
      prompt,
      manifest: {
        schema_version: "1.0",
        request_id: randomUUID(),
        analysis_id: run.id,
        stage: "followup_qa",
        lens: run.lens ?? "pre_merge",
        question: input.question,
      },
      files: [],
      requestId: randomUUID(),
    });
  } catch (error) {
    getLogger().warn({ err: error }, "AI question failed");
    throw new AppError(
      "AI_REQUEST_FAILED",
      502,
      "The AI workflow did not answer the question.",
    );
  }
  const parsed = followupAnswerSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "AI_PROTOCOL_ERROR",
      502,
      "The AI answer was not valid follow-up JSON.",
    );
  }
  const exchange: RunExchange = {
    id: randomUUID(),
    question: input.question,
    answer: parsed.data.answer,
    citations: parsed.data.citations.slice(0, 20),
    createdAt: new Date().toISOString(),
  };
  await deps.repository.appendExchange(run.id, exchange);
  return exchange;
}

export async function listRunExchanges(
  repository: AnalysisRunRepository,
  analysisRunId: string,
): Promise<RunExchange[]> {
  const run = await repository.findById(analysisRunId);
  if (run === null) {
    throw new NotFoundError("ANALYSIS_RUN_NOT_FOUND", "Analysis run was not found.");
  }
  return repository.listExchanges(analysisRunId);
}
