import { Alert, Card, Skeleton, Table, Tabs, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { useAnalysis } from "../api/hooks.js";
import { AiReport } from "../components/AiReport.js";
import { SystemFindings } from "../components/SystemFindings.js";
import { Verdict } from "../components/Verdict.js";

export function RunDetailPage(): React.JSX.Element {
  const { id } = useParams();
  const analysis = useAnalysis(id);

  if (analysis.isLoading) return <Skeleton active />;
  if (analysis.error instanceof Error) {
    return <Alert type="error" showIcon message={analysis.error.message} />;
  }
  const run = analysis.data;
  if (run === undefined) return <Alert type="warning" showIcon message="Run not found." />;

  const pending = run.status === "queued" || run.status === "running";

  return (
    <div>
      <Card
        title={run.goal}
        extra={
          <span style={{ display: "flex", gap: 8 }}>
            {run.kind === "comparison" && <Tag color="purple">comparison</Tag>}
            <Tag>{run.status}</Tag>
          </span>
        }
      >
        <Typography.Text type="secondary">
          {run.baseRef} → {run.currentRef}
          {run.comparison && (
            <>
              {" "}
              · base <Typography.Text code>{run.comparison.baseCommit.slice(0, 12)}</Typography.Text>
              {run.comparison.currentIsWorktree ? (
                <> · current worktree</>
              ) : (
                <>
                  {" "}
                  · current{" "}
                  <Typography.Text code>
                    {run.comparison.currentCommit.slice(0, 12)}
                  </Typography.Text>
                </>
              )}
            </>
          )}
        </Typography.Text>
        {run.error && (
          <Alert type="error" showIcon message={run.error} style={{ marginTop: 12 }} />
        )}
      </Card>

      <Tabs
        style={{ marginTop: 16 }}
        defaultActiveKey="verdict"
        items={[
          {
            key: "verdict",
            label: "Verdict & AI",
            children: (
              <div>
                <Verdict run={run} />
                {!pending && run.aiReport !== undefined && run.aiReport !== null && (
                  <div style={{ marginTop: 12 }}>
                    <AiReport report={run.aiReport} />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "findings",
            label: `Issues by system (${run.findings.length})`,
            children: pending ? (
              <Alert
                type="info"
                showIcon
                message="The review is still running — issues appear here automatically."
              />
            ) : (
              <SystemFindings findings={run.findings} />
            ),
          },
          {
            key: "changes",
            label: `Changed files (${run.comparison?.changedFiles.length ?? 0})`,
            children: (
              <Table
                rowKey="relativePath"
                pagination={{ pageSize: 20 }}
                dataSource={run.comparison?.changedFiles ?? []}
                columns={[
                  { title: "File", dataIndex: "relativePath" },
                  { title: "Change", dataIndex: "changeType" },
                  {
                    title: "Was",
                    dataIndex: "previousPath",
                    render: (value?: string) => value ?? "—",
                  },
                ]}
              />
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
