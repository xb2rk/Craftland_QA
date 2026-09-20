/**
 * Review prompt (impact_analysis stage).
 *
 * Responsibility: build the main review prompt from the user goal, lens,
 * response depth, reviewer notes, and focus paths. Lens and depth wording
 * is the contract the AI report normalizer and tests rely on — change the
 * wording only together with a PROMPT_VERSION bump in ./shared.
 */
import type { AnalysisLens, Verbosity } from "../../analysis/analysis-run.entity.js";
import { AI_PROMPT_VERSION, type AiStage } from "./shared.js";

const LENS_INSTRUCTIONS: Record<AnalysisLens, string[]> = {
  pre_merge: [
    "Lens: pre-merge risk check.",
    "Prioritize merge-blocking defects, schema drift, and broken references.",
    "Flag broad refactors as integration risk even when internally consistent.",
  ],
  balance: [
    "Lens: game balance review.",
    "Focus on difficulty curves, stat outliers, unfair spikes, and pacing shifts.",
    "Quantify changes (old value vs new value) whenever the evidence allows.",
  ],
  economy: [
    "Lens: game economy audit.",
    "Focus on prices, rewards, currencies, sinks, faucets, and progression pacing.",
    "Trace every price or reward change to its earn/spend impact.",
  ],
  localization: [
    "Lens: localization QA.",
    "Verify every data row matches its header column count exactly.",
    "Verify every new content key has matching localization entries and vice versa.",
    "Treat any row-width mismatch as a high-severity finding.",
  ],
  explain: [
    "Lens: explain this change in plain designer language.",
    "Avoid jargon; explain what players will notice and why it matters.",
    "Still cite file paths for every claim so developers can verify.",
  ],
  test_plan: [
    "Lens: test-plan generator.",
    "Put the verification checklist in recommendations, ordered by risk.",
    "Each recommendation must name the exact files and behaviors to exercise.",
  ],
};

const DEPTH_INSTRUCTIONS: Record<Verbosity, string> = {
  short:
    "Response depth: short. Return the verdict plus at most 3 findings and 3 recommendations. Omit inferences and hypotheses unless they change the verdict.",
  medium:
    "Response depth: medium. Cover every material finding with a concise description; keep inferences brief.",
  long: "Response depth: long. Give full detail: every finding, inference, unknown, and recommendation with evidence.",
  auto: "Response depth: auto. Size the response to the change: small diffs get a short verdict, broad refactors get full detail.",
};

export function buildPrompt(input: {
  goal: string;
  stage?: AiStage;
  lens?: AnalysisLens;
  verbosity?: Verbosity;
  notes?: string;
  focusPaths?: string[];
}): string {
  const stage = input.stage ?? "impact_analysis";
  const lens = input.lens ?? "pre_merge";
  const verbosity = input.verbosity ?? "auto";
  const focus = (input.focusPaths ?? []).filter((path) => path.length > 0);
  return [
    `You are the Craftland Quality Analyzer (prompt v${AI_PROMPT_VERSION}).`,
    `Current stage: ${stage}.`,
    ...LENS_INSTRUCTIONS[lens],
    DEPTH_INSTRUCTIONS[verbosity],
    ...(focus.length > 0
      ? [
          `Focus review effort on these files first: ${focus.slice(0, 50).join(", ")}.`,
          "Still report critical issues found anywhere else in the evidence.",
        ]
      : []),
    ...(input.notes !== undefined && input.notes.length > 0
      ? [`Reviewer notes: ${input.notes}`]
      : []),
    "Compare the base revision against the current revision using only the repository evidence described in Manifest and supplied in DataList.",
    "Distinguish confirmed facts, probable inferences, hypotheses, and unknowns.",
    "Never invent files, symbols, config keys, values, or line numbers.",
    "Every finding must cite repository-relative file paths and line ranges.",
    "Calibrate confidence from evidence coverage: broad unknowns or truncated diffs must lower confidence to medium or low.",
    "Keep JSON property names in English; never translate JSON keys.",
    "Use canonical top-level keys: summary, findings, inferences, hypotheses, unknowns, recommendations, stage, and status.",
    "In summary use: overall_assessment, risk_level, confidence, and change_scope; change_scope must be low, medium, or high.",
    "In each finding use: id, title, dimension, severity, certainty, description, evidence, impact, flow_safety, and recovery_risk.",
    "In each unknown use: id, statement, and evidence (file path with line ranges).",
    "In each recommendation use: id, priority, dimension, recommendation, justification, and evidence.",
    "Write all human-readable string values in English.",
    "Return exactly one JSON object matching schema version 1.0.",
    "Do not add Markdown outside the JSON object.",
    `User goal: ${input.goal}`,
  ].join("\n");
}
