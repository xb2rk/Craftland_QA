export interface NormalizedAiReport {
  schema_version: string;
  stage: string;
  status: string;
  summary: {
    overall_assessment: string;
    risk_level: string;
    confidence: string;
    change_scope: string;
  };
  findings: Array<Record<string, unknown>>;
  inferences: Array<Record<string, unknown>>;
  hypotheses: Array<Record<string, unknown>>;
  unknowns: Array<unknown>;
  recommendations: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
const VALID_SCOPES = new Set(["low", "medium", "high"]);

export function normalizeAiReport(
  raw: Record<string, unknown>,
): NormalizedAiReport {
  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const asArray = <T>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [];

  const summary = asRecord(raw.summary);
  const changeScope = toText(summary.change_scope).toLowerCase();
  const normalized: NormalizedAiReport = {
    ...raw,
    schema_version: toText(raw.schema_version, "1.0"),
    stage: toText(raw.stage, "impact_analysis"),
    status: toText(raw.status, "completed"),
    summary: {
      overall_assessment: toText(
        summary.overall_assessment,
        "AI analysis completed with limited structured detail.",
      ),
      risk_level: toText(summary.risk_level, "unknown"),
      confidence: toText(summary.confidence, "low"),
      change_scope: VALID_SCOPES.has(changeScope) ? changeScope : "unknown",
    },
    findings: asArray<Record<string, unknown>>(raw.findings).map((finding, index) =>
      normalizeFinding(asRecord(finding), index),
    ),
    inferences: asArray<Record<string, unknown>>(raw.inferences),
    hypotheses: asArray<Record<string, unknown>>(raw.hypotheses),
    unknowns: asArray<unknown>(raw.unknowns),
    recommendations: asArray<Record<string, unknown>>(raw.recommendations).map(
      (recommendation, index) =>
        normalizeRecommendation(asRecord(recommendation), index),
    ),
  };
  return normalized;
}

function normalizeFinding(
  finding: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const severity = toText(finding.severity).toLowerCase();
  return {
    id: toText(finding.id, `ai-finding-${index + 1}`),
    title: toText(finding.title, "Untitled finding"),
    dimension: toText(finding.dimension, "general"),
    severity: VALID_SEVERITIES.has(severity) ? severity : "info",
    certainty: toText(finding.certainty, "hypothesis"),
    description: toText(finding.description, ""),
    evidence: finding.evidence ?? [],
    impact: toText(finding.impact, ""),
    flow_safety: toText(finding.flow_safety, ""),
    recovery_risk: toText(finding.recovery_risk, ""),
  };
}

function normalizeRecommendation(
  recommendation: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  return {
    id: toText(recommendation.id, `ai-recommendation-${index + 1}`),
    priority: toText(recommendation.priority, "medium"),
    dimension: toText(recommendation.dimension, "general"),
    recommendation: toText(
      recommendation.recommendation ?? recommendation.title,
      "Review the reported findings.",
    ),
    justification: toText(recommendation.justification, ""),
    evidence: recommendation.evidence ?? [],
  };
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}
