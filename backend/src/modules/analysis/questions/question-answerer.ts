/**
 * Follow-up Q&A over a completed run.
 *
 * Responsibility: validate run/AI preconditions, build the digest prompt,
 * call the AI workflow once, validate the answer shape, and persist the
 * exchange. Called by AnalysisService; no HTTP or queue concerns here.
 */
import { createHash, randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import type { AppConfig } from "../../../config/env.js";
import type { WorkflowFile } from "../../ai/context-builder.js";
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
  // Insea requires a non-empty DataList: attach the run digest the question
  // is about as the evidence file.
  const digestLines = [
    `Question: ${input.question}`,
    `Lens: ${run.lens ?? "pre_merge"}`,
    `Revision: ${run.baseRef} -> ${run.currentRef}`,
    `Deterministic findings: ${run.findings.length}`,
    ...run.findings.slice(0, 40).map(
      (finding) =>
        `- [${finding.severity}] ${finding.code}: ${finding.message} (${finding.filePath}${finding.line !== undefined ? `:${finding.line}` : ""})`,
    ),
    "",
    "AI assessment:",
    typeof summary.overall_assessment === "string"
      ? summary.overall_assessment.slice(0, 2000)
      : "No AI assessment.",
  ];
  const digestBody = digestLines.join("\n").slice(0, 12000);
  const questionId = randomUUID();
  const digestPath = join(tmpdir(), `question-${questionId}.txt`);
  await writeFile(digestPath, digestBody, "utf8");
  const digestBytes = Buffer.byteLength(digestBody, "utf8");
  const digestSha = createHash("sha256").update(digestBody, "utf8").digest("hex");
  const digestFile: WorkflowFile = {
    absolutePath: digestPath,
    uploadName: "run-digest.txt",
    contentType: "text/plain",
    sha256: digestSha,
    sizeBytes: digestBytes,
  };
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
        attachments: [
          {
            id: "question-file-1",
            upload_name: digestFile.uploadName,
            relative_path: "(generated run digest)",
            revision: run.currentRef,
            kind: "digest",
            content_type: digestFile.contentType,
            size_bytes: digestBytes,
            sha256: digestSha,
          },
        ],
      },
      files: [digestFile],
      requestId: randomUUID(),
    });
  } catch (error) {
    getLogger().warn({ err: error }, "AI question failed");
    throw new AppError(
      "AI_REQUEST_FAILED",
      502,
      "The AI workflow did not answer the question.",
    );
  } finally {
    await unlink(digestPath).catch(() => undefined);
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
