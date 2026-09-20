import { Alert, Card, Skeleton, Tag, Typography } from "antd";

import type { AnalysisRun, NormalizedAiReport } from "../api/types.js";
import { riskColor } from "./system-map.js";
import { RiskTag } from "./ui/RiskTag.js";

function asReport(value: unknown): NormalizedAiReport | null {
  if (typeof value !== "object" || value === null) return null;
  return value as NormalizedAiReport;
}

export function Verdict({ run }: { run: AnalysisRun }): React.JSX.Element {
  const pending = run.status === "queued" || run.status === "running";
  if (pending) {
    return (
      <Card title="Verdict">
        <Skeleton active paragraph={{ rows: 3 }} />
        <Typography.Text type="secondary">
          Reviewing {run.baseRef} → {run.currentRef}… this updates automatically.
        </Typography.Text>
      </Card>
    );
  }
  if (run.status === "failed") {
    return (
      <Card title="Verdict">
        <Alert type="error" showIcon message={run.error ?? "The analysis failed."} />
      </Card>
    );
  }

  const report = asReport(run.aiReport);
  const summary = report?.summary;
  const risk = summary?.risk_level ?? "unknown";
  const normalized = risk.toLowerCase();
  const tone = normalized.includes("high") || normalized === "critical"
    ? "high"
    : normalized.includes("medium")
      ? "medium"
      : normalized.includes("low")
        ? "low"
        : "";
  const rawAssessment = summary?.overall_assessment ?? "";
  const assessment =
    rawAssessment.trim().length > 0
      ? rawAssessment
      : "AI analysis completed with limited structured detail — see findings below.";
  const aiFindings = Array.isArray(report?.findings) ? report!.findings : [];
  const recommendations = Array.isArray(report?.recommendations) ? report!.recommendations : [];

  return (
    <div className={`cqa-verdict-banner${tone ? ` cqa-verdict-${tone}` : ""}`}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          Verdict
        </Typography.Title>
        <RiskTag risk={risk} />
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tag>Confidence: {summary?.confidence ?? "—"}</Tag>
          <Tag>Scope: {summary?.change_scope ?? "—"}</Tag>
          <Tag>
            {run.comparison?.changedFiles.length ?? 0} files · {run.baseRef} → {run.currentRef}
          </Tag>
        </span>
      </div>
      {report === null && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`AI ${run.aiStatus ?? "unavailable"} — the deterministic findings below still stand on their own.`}
        />
      )}
      <Typography.Paragraph style={{ fontSize: 15, marginBottom: 8 }}>
        {assessment}
      </Typography.Paragraph>
      {aiFindings.length > 0 && (
        <div>
          <Typography.Text strong>Top concerns</Typography.Text>
          <ul style={{ marginTop: 4, marginBottom: 4, paddingLeft: 20 }}>
            {aiFindings.slice(0, 3).map((finding) => (
              <li key={finding.id}>
                {finding.title}{" "}
                <Tag color={riskColor(finding.severity)}>{finding.severity}</Tag>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommendations.length > 0 && (
        <Typography.Text type="secondary">
          {recommendations.length} recommendation{recommendations.length === 1 ? "" : "s"} in the AI
          tab.
        </Typography.Text>
      )}
    </div>
  );
}
