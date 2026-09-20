import { Card, Empty, List, Tag, Typography } from "antd";

import type { NormalizedAiReport } from "../api/types.js";

function asReport(value: unknown): NormalizedAiReport | null {
  if (typeof value !== "object" || value === null) return null;
  return value as NormalizedAiReport;
}

export function AiReport({ report }: { report: unknown }): React.JSX.Element {
  const normalized = asReport(report);
  if (normalized === null) return <Empty description="No AI report." />;
  const summary = normalized.summary ?? {
    overall_assessment: "",
    risk_level: "unknown",
    confidence: "low",
    change_scope: "unknown",
  };
  const findings = Array.isArray(normalized.findings) ? normalized.findings : [];
  const recommendations = Array.isArray(normalized.recommendations)
    ? normalized.recommendations
    : [];
  const unknowns = Array.isArray(normalized.unknowns) ? normalized.unknowns : [];

  return (
    <div>
      <Card title="Summary" style={{ marginBottom: 12 }}>
        <Typography.Paragraph>{summary.overall_assessment}</Typography.Paragraph>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tag>Risk: {summary.risk_level}</Tag>
          <Tag>Confidence: {summary.confidence}</Tag>
          <Tag>Scope: {summary.change_scope}</Tag>
        </div>
      </Card>
      <Card title={`Findings (${findings.length})`} style={{ marginBottom: 12 }}>
        {findings.length === 0 ? (
          <Empty description="No AI findings." />
        ) : (
          <List
            dataSource={findings}
            renderItem={(finding) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <span>
                      {String(finding.title)}{" "}
                      <Tag>{String(finding.severity)}</Tag>
                      <Tag>{String(finding.dimension)}</Tag>
                    </span>
                  }
                  description={
                    <span>
                      {String(finding.description ?? "")}
                      {finding.impact !== undefined && String(finding.impact).length > 0 && (
                        <><br />Impact: {String(finding.impact)}</>
                      )}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
      <Card title={`Recommendations (${recommendations.length})`} style={{ marginBottom: 12 }}>
        {recommendations.length === 0 ? (
          <Empty description="No recommendations." />
        ) : (
          <List
            dataSource={recommendations}
            renderItem={(recommendation) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <span>
                      {String(recommendation.recommendation)}{" "}
                      <Tag>{String(recommendation.priority)}</Tag>
                    </span>
                  }
                  description={String(recommendation.justification ?? "")}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
      {unknowns.length > 0 && (
        <Card title={`Unknowns (${unknowns.length})`}>
          <List
            dataSource={unknowns}
            renderItem={(unknown) => (
              <List.Item>
                <Typography.Text code style={{ whiteSpace: "pre-wrap" }}>
                  {typeof unknown === "string" ? unknown : JSON.stringify(unknown, null, 2)}
                </Typography.Text>
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
}
