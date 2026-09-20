/**
 * What-if prompt (hypothetical single-cell config edit).
 *
 * Responsibility: evaluate exactly one proposed value change against the
 * deterministic pre-checks. Confidence must stay low without consumer
 * evidence — a single cell cannot prove system-wide safety.
 */
import { AI_PROMPT_VERSION } from "./shared.js";

export interface WhatIfPromptInput {
  filePath: string;
  keyColumn: string;
  keyValue: string;
  column: string;
  oldValue: string;
  newValue: string;
  goal?: string;
  auditNotes: string;
}

export function buildWhatIfPrompt(input: WhatIfPromptInput): string {
  return [
    `You are the Craftland Quality Analyzer (prompt v${AI_PROMPT_VERSION}).`,
    "Current stage: impact_analysis (hypothetical change).",
    "Evaluate ONE proposed config edit. Assume nothing else in the repository changes.",
    `File: ${input.filePath}`,
    `Row key: ${input.keyColumn} = ${input.keyValue}`,
    `Proposed edit: column "${input.column}" changes from "${input.oldValue}" to "${input.newValue}".`,
    ...(input.goal !== undefined && input.goal.length > 0
      ? [`Designer goal context: ${input.goal}`]
      : []),
    `Deterministic pre-checks on the edited content: ${input.auditNotes}`,
    "Decide whether the edit is safe, risky, or breaking, and explain what players or downstream systems would feel.",
    "Never invent files, keys, values, or line numbers. Cite the file path for every claim.",
    "Calibrate confidence from evidence coverage; a single-cell hypothetical with no consumer evidence must not claim high confidence about system-wide effects.",
    "Keep JSON property names in English; never translate JSON keys.",
    "Use canonical top-level keys: summary, findings, inferences, hypotheses, unknowns, recommendations, stage, and status.",
    "In summary use: overall_assessment, risk_level, confidence, and change_scope; change_scope must be low, medium, or high.",
    "In each unknown use: id, statement, and evidence (file path with line ranges).",
    "In each recommendation use: id, priority, dimension, recommendation, justification, and evidence.",
    "Write all human-readable string values in English.",
    "Return exactly one JSON object matching schema version 1.0.",
    "Do not add Markdown outside the JSON object.",
  ].join("\n");
}
