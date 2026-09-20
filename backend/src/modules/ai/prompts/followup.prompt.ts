/**
 * Follow-up Q&A prompt (followup_qa stage).
 *
 * Responsibility: answer one user question from a completed run's digest
 * plus earlier exchanges. The digest is the only repository evidence the
 * model sees here, so the prompt forces an explicit unknown when the
 * digest does not contain the answer.
 */
import type { AnalysisLens } from "../../analysis/analysis-run.entity.js";
import { AI_PROMPT_VERSION } from "./shared.js";

export interface FollowupPromptInput {
  goal: string;
  lens?: AnalysisLens;
  question: string;
  history: Array<{ question: string; answer: string }>;
  digest: {
    baseRef: string;
    currentRef: string;
    changedFiles: Array<{ relativePath: string; changeType: string }>;
    findingCount: number;
    deterministicFindings: Array<{
      code: string;
      severity: string;
      message: string;
      filePath: string;
      line?: number;
    }>;
    aiAssessment: string;
  };
}

export function buildFollowupPrompt(input: FollowupPromptInput): string {
  const lens = input.lens ?? "pre_merge";
  const history =
    input.history.length === 0
      ? "No earlier questions."
      : input.history
          .map(
            (exchange, index) =>
              `Q${index + 1}: ${exchange.question}\nA${index + 1}: ${exchange.answer}`,
          )
          .join("\n");
  return [
    `You are the Craftland Quality Analyzer (prompt v${AI_PROMPT_VERSION}).`,
    "Current stage: followup_qa.",
    `Lens: ${lens}.`,
    "Answer the user's question using ONLY the run digest below and earlier answers in this conversation.",
    "Never invent files, values, or line numbers. Cite repository-relative file paths for every factual claim.",
    "If the digest does not contain the answer, say so explicitly and record it as an unknown.",
    "Keep JSON property names in English. Write all human-readable strings in English.",
    "Return exactly one JSON object with keys: answer (string), citations (array of file-path strings), unknowns (array of {id, statement, evidence}).",
    "Do not add Markdown outside the JSON object.",
    `Original goal: ${input.goal}`,
    `Revision: ${input.digest.baseRef} → ${input.digest.currentRef}.`,
    `Changed files (${input.digest.changedFiles.length}): ${input.digest.changedFiles
      .slice(0, 60)
      .map((file) => `${file.changeType}:${file.relativePath}`)
      .join(", ")}`,
    `Deterministic findings (${input.digest.findingCount}): ${JSON.stringify(
      input.digest.deterministicFindings.slice(0, 40),
    )}`,
    `Prior AI assessment: ${input.digest.aiAssessment.slice(0, 2000)}`,
    `Earlier questions:\n${history}`,
    `User question: ${input.question}`,
  ].join("\n");
}
