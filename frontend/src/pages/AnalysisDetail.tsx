import { Alert, Card, Descriptions, Skeleton, Table, Tabs, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { useAnalysis } from "../api/hooks.js";
import { AiReport } from "../components/AiReport.js";
import { FindingsTable } from "../components/FindingsTable.js";

export function AnalysisDetailPage(): React.JSX.Element {
  const { id } = useParams();
  const analysis = useAnalysis(id);

  if (analysis.isLoading) return <Skeleton active />;
  if (analysis.error instanceof Error) {
    return <Alert type="error" showIcon message={analysis.error.message} />;
  }
  const run = analysis.data;
  if (run === undefined) return <Alert type="warning" showIcon message="Analysis not found." />;

  const pending = run.status === "queued" || run.status === "running";

  return (
    <div>
      <Card title={run.goal} extra={<Tag>{run.status}</Tag>}>
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="Kind">{run.kind}</Descriptions.Item>
          <Descriptions.Item label="AI">{run.aiStatus ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Base">{run.baseRef}</Descriptions.Item>
          <Descriptions.Item label="Current">{run.currentRef}</Descriptions.Item>
          <Descriptions.Item label="Base commit">
            <Typography.Text code>{run.comparison?.baseCommit.slice(0, 12) ?? "—"}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Current commit">
            <Typography.Text code>{run.comparison?.currentCommit.slice(0, 12) ?? "—"}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
        {run.error && (
          <Alert type="error" showIcon message={run.error} style={{ marginTop: 12 }} />
        )}
      </Card>

      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: "findings",
            label: `Findings (${run.findings.length})`,
            children: pending ? (
              <Alert type="info" showIcon message="Analysis is still running — findings will appear automatically." />
            ) : (
              <FindingsTable findings={run.findings} />
            ),
          },
          {
            key: "changes",
            label: `Changes (${run.comparison?.changedFiles.length ?? 0})`,
            children: (
              <Table
                rowKey="relativePath"
                pagination={{ pageSize: 20 }}
                dataSource={run.comparison?.changedFiles ?? []}
                columns={[
                  { title: "Path", dataIndex: "relativePath" },
                  { title: "Change", dataIndex: "changeType" },
                  { title: "Previous", dataIndex: "previousPath", render: (value?: string) => value ?? "—" },
                ]}
              />
            ),
          },
          {
            key: "ai",
            label: "AI report",
            children: pending ? (
              <Alert type="info" showIcon message="Waiting for the run to finish." />
            ) : run.aiReport === undefined || run.aiReport === null ? (
              <Alert type="warning" showIcon message={`AI ${run.aiStatus ?? "unavailable"} — deterministic findings above are still valid.`} />
            ) : (
              <AiReport report={run.aiReport} />
            ),
          },
          {
            key: "raw",
            label: "Raw JSON",
            children: (
              <Typography.Text code style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(run, null, 2)}
              </Typography.Text>
            ),
          },
        ]}
      />
    </div>
  );
}
