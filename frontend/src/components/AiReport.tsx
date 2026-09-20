import { Card, Empty, List, Tag, Typography } from "antd";

import type { NormalizedAiReport } from "../api/types.js";

function asReport(value: unknown): NormalizedAiReport | null {
  if (typeof value !== "object" || value === null) return null;
  return value as NormalizedAiReport;
}

function renderUnknown(unknown: unknown): React.JSX.Element {
  if (typeof unknown === "string") return <>{unknown}</>;
  if (typeof unknown === "object" && unknown !== null) {
    const item = unknown as { id?: unknown; statement?: unknown; evidence?: unknown };
    return (
      <span>
        {item.id !== undefined && <Tag>{String(item.id)}</Tag>}{" "}
        {item.statement !== undefined ? (
          <>{String(item.statement)}</>
        ) : (
          <Typography.Text code style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(unknown)}
          </Typography.Text>
        )}
        {item.evidence !== undefined && (
          <>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Evidence:{" "}
              {Array.isArray(item.evidence)
                ? item.evidence
                    .map((entry) =>
                      typeof entry === "object" && entry !== null
                        ? Object.values(entry as Record<string, unknown>)
                            .map(String)
                            .join(" ")
                        : String(entry),
                    )
                    .join(" · ")
                : typeof item.evidence === "object"
                  ? JSON.stringify(item.evidence)
                  : String(item.evidence)}
            </Typography.Text>
          </>
        )}
      </span>
    );
  }
  return <>{String(unknown)}</>;
}

function renderEvidence(evidence: unknown): string | null {
  if (evidence === undefined || evidence === null) return null;
  if (typeof evidence === "string") return evidence;
  if (Array.isArray(evidence)) {
    return evidence
      .map((entry) =>
        typeof entry === "object" && entry !== null
          ? JSON.stringify(entry)
          : String(entry),
      )
      .join(" · ");
  }
  if (typeof evidence === "object") return JSON.stringify(evidence);
  return String(evidence);
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
            renderItem={(recommendation) => {
              const evidence = renderEvidence(recommendation.evidence);
              return (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <span>
                        {String(recommendation.recommendation)}{" "}
                        <Tag>{String(recommendation.priority)}</Tag>
                        <Tag>{String(recommendation.dimension)}</Tag>
                      </span>
                    }
                    description={
                      <span>
                        {String(recommendation.justification ?? "")}
                        {evidence !== null && evidence.length > 0 && (
                          <>
                            <br />
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              Evidence: {evidence}
                            </Typography.Text>
                          </>
                        )}
                      </span>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>
      {unknowns.length > 0 && (
        <Card title={`Unknowns (${unknowns.length})`}>
          <List
            dataSource={unknowns}
            renderItem={(unknown, index) => (
              <List.Item key={index}>
                {renderUnknown(unknown)}
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
}
