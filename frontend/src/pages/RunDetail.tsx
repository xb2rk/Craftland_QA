import { Alert, Button, Card, Skeleton, Tabs, Tag, Typography } from "antd";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAnalysis, useHealth, useStartAnalysisMutation } from "../api/hooks.js";
import { ApiError } from "../api/types.js";
import { AiReport, unknownQuestion } from "../components/AiReport.js";
import { FixChecklist } from "../components/FixChecklist.js";
import { QuestionDrawer } from "../components/QuestionDrawer.js";
import { SystemFindings } from "../components/SystemFindings.js";
import { Verdict } from "../components/Verdict.js";
import { exportDiffText, exportRunJson } from "../components/run-io.js";

export function RunDetailPage(): React.JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const analysis = useAnalysis(id);
  const health = useHealth();
  const startAnalysis = useStartAnalysisMutation();
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [drawerQuestion, setDrawerQuestion] = useState<string | undefined>(undefined);

  const openAsk = (question?: string): void => {
    setDrawerQuestion(question);
    setQuestionsOpen(true);
  };

  if (analysis.isLoading) return <Skeleton active />;
  if (analysis.error instanceof Error) {
    return <Alert type="error" showIcon message={analysis.error.message} />;
  }
  const run = analysis.data;
  if (run === undefined) return <Alert type="warning" showIcon message="Run not found." />;

  const pending = run.status === "queued" || run.status === "running";

  const rerun = (): void => {
    startAnalysis.mutate(
      {
        localPath: run.localPath,
        baseRef: run.baseRef,
        currentRef: run.currentRef,
        goal: run.goal,
        lens: run.lens,
        verbosity: run.verbosity,
        focusPaths: run.focusPaths,
        notes: run.notes,
      },
      { onSuccess: (created) => navigate(`/runs/${created.id}`) },
    );
  };

  return (
    <div>
      <Card
        title={run.goal}
        extra={
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {run.kind === "comparison" && <Tag color="purple">comparison</Tag>}
            {run.lens && run.lens !== "pre_merge" && (
              <Tag color="blue">{run.lens.replace(/_/g, " ")}</Tag>
            )}
            {run.verbosity && run.verbosity !== "auto" && <Tag>{run.verbosity}</Tag>}
            {run.focusPaths && run.focusPaths.length > 0 && (
              <Tag color="purple">{run.focusPaths.length} focused</Tag>
            )}
            <Tag>{run.status}</Tag>
            {run.kind === "analysis" && (
              <Button
                size="small"
                disabled={pending}
                loading={startAnalysis.isPending}
                onClick={rerun}
              >
                Rerun
              </Button>
            )}
            <Button size="small" onClick={() => openAsk()}>
              Ask about this change
            </Button>
            <Button size="small" onClick={() => exportRunJson(run)}>
              Export JSON
            </Button>
            <Button
              size="small"
              disabled={!run.comparison?.unifiedDiff}
              onClick={() => exportDiffText(run)}
            >
              Export diff
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
                    <AiReport
                      report={run.aiReport}
                      onAskUnknown={(unknown) => openAsk(unknownQuestion(unknown))}
                    />
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
              <SystemFindings
                findings={run.findings}
                onAsk={(question) => openAsk(question)}
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
        initialQuestion={drawerQuestion}
        aiConfigured={health.data?.ai.configured === true}
        onClose={() => setQuestionsOpen(false)}
      />
      {startAnalysis.error instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={`${startAnalysis.error.code}: ${startAnalysis.error.message}`}
        />
      )}
    </div>
  );
}
