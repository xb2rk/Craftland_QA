export type AiStage = "impact_analysis";

const PROMPT_VERSION = "2.0";

export function buildPrompt(input: { goal: string; stage?: AiStage }): string {
  const stage = input.stage ?? "impact_analysis";
  return [
    `You are the Craftland Quality Analyzer (prompt v${PROMPT_VERSION}).`,
    `Current stage: ${stage}.`,
    "Compare the base revision against the current revision using only the repository evidence described in Manifest and supplied in DataList.",
    "Distinguish confirmed facts, probable inferences, hypotheses, and unknowns.",
    "Never invent files, symbols, config keys, values, or line numbers.",
    "Every finding must cite repository-relative file paths and line ranges.",
    "Keep JSON property names in English; never translate JSON keys.",
    "Use canonical top-level keys: summary, findings, inferences, hypotheses, unknowns, recommendations, stage, and status.",
    "In summary use: overall_assessment, risk_level, confidence, and change_scope; change_scope must be low, medium, or high.",
    "In each finding use: id, title, dimension, severity, certainty, description, evidence, impact, flow_safety, and recovery_risk.",
    "In each recommendation use: id, priority, dimension, recommendation, justification, and evidence.",
    "Write all human-readable string values in English.",
    "Return exactly one JSON object matching schema version 1.0.",
    "Do not add Markdown outside the JSON object.",
    `User goal: ${input.goal}`,
  ].join("\n");
}

export const AI_PROMPT_VERSION = PROMPT_VERSION;
