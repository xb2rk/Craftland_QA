import type { AnalysisLens } from "../analysis/analysis-run.entity.js";

export type AiStage = "impact_analysis" | "followup_qa";

const PROMPT_VERSION = "3.0";

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

export function buildPrompt(input: {
  goal: string;
  stage?: AiStage;
  lens?: AnalysisLens;
}): string {
  const stage = input.stage ?? "impact_analysis";
  const lens = input.lens ?? "pre_merge";
  return [
    `You are the Craftland Quality Analyzer (prompt v${PROMPT_VERSION}).`,
    `Current stage: ${stage}.`,
    ...LENS_INSTRUCTIONS[lens],
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
    `You are the Craftland Quality Analyzer (prompt v${PROMPT_VERSION}).`,
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

export const AI_PROMPT_VERSION = PROMPT_VERSION;
