import { Alert, Button, Card, Skeleton, Table, Tabs, Tag, Typography } from "antd";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { useAnalysis, useHealth } from "../api/hooks.js";
import { AiReport } from "../components/AiReport.js";
import { DiffViewer } from "../components/DiffViewer.js";
import { FixChecklist } from "../components/FixChecklist.js";
import { QuestionDrawer } from "../components/QuestionDrawer.js";
import { SystemFindings } from "../components/SystemFindings.js";
import { Verdict } from "../components/Verdict.js";
import { exportRunJson } from "../components/run-io.js";

export function RunDetailPage(): React.JSX.Element {
  const { id } = useParams();
  const analysis = useAnalysis(id);
  const health = useHealth();
  const [questionsOpen, setQuestionsOpen] = useState(false);

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
            {run.lens && run.lens !== "pre_merge" && (
              <Tag color="blue">{run.lens.replace(/_/g, " ")}</Tag>
            )}
            <Tag>{run.status}</Tag>
            <Button size="small" onClick={() => setQuestionsOpen(true)}>
              Ask about this change
            </Button>
            <Button size="small" onClick={() => exportRunJson(run)}>
              Export JSON
            </Button>
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
                {!pending && (
                  <div style={{ marginTop: 12 }}>
                    <FixChecklist run={run} />
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
            key: "diff",
            label: "Diff",
            children: (
              <DiffViewer
                diff={run.comparison?.unifiedDiff}
                truncated={run.comparison?.diffTruncated}
              />
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
              <div className="dark-panel">
                {JSON.stringify(run, null, 2)}
              </div>
            ),
          },
        ]}
      />

      <QuestionDrawer
        runId={run.id}
        open={questionsOpen}
        aiConfigured={health.data?.ai.configured === true}
        onClose={() => setQuestionsOpen(false)}
      />
    </div>
  );
}
