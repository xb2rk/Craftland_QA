/**
 * Shared building blocks for versioned AI prompts.
 *
 * Responsibility: own the prompt version string, the stage vocabulary, and
 * small helpers reused by every prompt module. The per-stage prompt text
 * lives in sibling modules so each stage can evolve independently.
 */

export type AiStage = "impact_analysis" | "followup_qa";

/** Bumped whenever any prompt contract changes; surfaced in every prompt. */
export const AI_PROMPT_VERSION = "3.1";

/** Join prompt lines, dropping empty optional blocks. */
export function joinPromptLines(lines: Array<string | readonly string[]>): string {
  const flat: string[] = [];
  for (const line of lines) {
    if (typeof line === "string") flat.push(line);
    else for (const item of line) flat.push(item);
  }
  return flat.join("\n");
}

/** Canonical schema-1.0 contract shared by review-style JSON answers. */
export const REVIEW_SCHEMA_V1_LINES: readonly string[] = [
  "Keep JSON property names in English; never translate JSON keys.",
  "Use canonical top-level keys: summary, findings, inferences, hypotheses, unknowns, recommendations, stage, and status.",
  "In summary use: overall_assessment, risk_level, confidence, and change_scope; change_scope must be low, medium, or high.",
  "Write all human-readable string values in English.",
  "Return exactly one JSON object matching schema version 1.0.",
  "Do not add Markdown outside the JSON object.",
];

/** Evidence discipline shared by every stage: cite, never invent. */
export const EVIDENCE_RULE_LINES: readonly string[] = [
  "Never invent files, symbols, config keys, values, or line numbers.",
  "Every finding must cite repository-relative file paths and line ranges.",
];
