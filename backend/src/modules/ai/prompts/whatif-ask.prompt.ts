/**
 * What-if ask prompt (freeform hypothetical question).
 *
 * Responsibility: answer a plain-words tuning question from the attached
 * config snippets. The model may resolve the question to one exact cell
 * edit (resolvedEdit) so the runner can ground it with deterministic
 * pre-checks — but the prose answer is always required, even when no
 * exact cell can be resolved.
 */
import { AI_PROMPT_VERSION, joinPromptLines } from "./shared.js";

export interface WhatIfAskPromptInput {
  question: string;
  history: Array<{ question: string; answer: string }>;
  candidateFiles: Array<{ relativePath: string; snippet: string }>;
  /** Frontend regex hints (file/column/value guesses). Never trusted blindly. */
  hints?: string;
}

export function buildWhatIfAskPrompt(input: WhatIfAskPromptInput): string {
  const history =
    input.history.length === 0
      ? "No earlier questions."
      : input.history
          .slice(-6)
          .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
          .join("\n---\n");
  const candidates =
    input.candidateFiles.length === 0
      ? "No config candidate matched the question keywords."
      : input.candidateFiles
          .map(
            (file) => `File: ${file.relativePath}\n${file.snippet.slice(0, 4000)}`,
          )
          .join("\n---\n");
  return joinPromptLines([
    `You are the Craftland Quality Analyzer (prompt v${AI_PROMPT_VERSION}).`,
    "Current stage: followup_qa.",
    "Task: answer a designer's hypothetical tuning question using ONLY the attached config files.",
    "Assume nothing else in the repository changes. Decide whether the idea is safe, risky, or breaking, and explain what players or downstream systems would feel.",
    "Never invent files, keys, values, or line numbers. Cite repository-relative file paths for every factual claim.",
    "If the evidence does not contain the answer, say so explicitly instead of guessing.",
    ...(input.hints !== undefined && input.hints.length > 0
      ? [`Frontend parser hints (unverified, re-check against attachments): ${input.hints}`]
      : []),
    "Keep JSON property names in English; never translate JSON keys.",
    "Write all human-readable string values in English.",
    'Return exactly one JSON object: { "answer": string, "citations": string[], "resolvedEdit": { "filePath": string, "keyColumn": string, "keyValue": string, "column": string, "newValue": string } | null }.',
    'Set resolvedEdit to null when the question does not map to exactly one cell (e.g. open-ended "is this a good idea?" questions).',
    "Do not add Markdown outside the JSON object.",
    `Earlier conversation:\n${history}`,
    `Candidate configs:\n${candidates}`,
    `Question: ${input.question}`,
  ]);
}
