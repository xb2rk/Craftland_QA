import { Alert, Button, Card, Input, List, Select, Skeleton, Table, Tag, Typography, Upload } from "antd";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAnalyses, useCompareMutation, useImportRunMutation } from "../api/hooks.js";
import { ApiError, type AnalysisRun, type NormalizedAiReport } from "../api/types.js";
import { riskColor } from "../components/system-map.js";

function runRisk(run: { aiReport?: unknown }): string {
  const report = run.aiReport as NormalizedAiReport | undefined;
  return report?.summary?.risk_level ?? "—";
}

function changePreview(run: AnalysisRun): React.JSX.Element {
  const files = run.comparison?.changedFiles ?? [];
  if (files.length === 0) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <span>
      {files.slice(0, 3).map((file) => (
        <Tag key={file.relativePath} style={{ marginBottom: 2 }}>
          {file.relativePath.split("/").slice(-1)[0]}
        </Tag>
      ))}
      {files.length > 3 && <Tag>+{files.length - 3} more</Tag>}
    </span>
  );
}

export function RunsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const analyses = useAnalyses(100);
  const compare = useCompareMutation();
  const importRun = useImportRunMutation();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [compareGoal, setCompareGoal] = useState("Compare the two selected runs");

  const rows = useMemo(() => {
    return (analyses.data ?? []).filter((run) => {
      if (status !== undefined && run.status !== status) return false;
      if (query.trim().length === 0) return true;
      const needle = query.trim().toLowerCase();
      return (
        run.goal.toLowerCase().includes(needle) ||
        run.localPath.toLowerCase().includes(needle)
      );
    });
  }, [analyses.data, status, query]);

  if (analyses.isLoading) return <Skeleton active />;

  return (
    <Card
      title="Runs"
      extra={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input
            placeholder="Search goal or project"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="Status"
            value={status}
            onChange={setStatus}
            options={["queued", "running", "completed", "failed"].map((value) => ({
              value,
              label: value,
            }))}
            style={{ width: 140 }}
          />
          <Button
            type={compareMode ? "primary" : "default"}
            onClick={() => {
              setCompareMode(!compareMode);
              setPicked([]);
            }}
          >
            {compareMode ? "Done picking" : "Compare two runs"}
          </Button>
          <Upload
            accept="application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              void file
                .text()
                .then((text) => importRun.mutate(JSON.parse(text) as Record<string, unknown>, {
                  onSuccess: (run) => navigate(`/runs/${run.id}`),
                }));
              return false;
            }}
          >
            <Button loading={importRun.isPending}>Import run</Button>
          </Upload>
        </div>
      }
    >
      {compareMode && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Tick two completed runs below, then compare — the delta is instant and needs no AI."
        />
      )}
      <Table
        rowKey="id"
        dataSource={rows}
        expandable={{
          expandedRowRender: (run) => (
            <List
              size="small"
              dataSource={(run.comparison?.changedFiles ?? []).slice(0, 10)}
              renderItem={(file) => (
                <List.Item>
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {file.relativePath}
                  </Typography.Text>{" "}
                  <Tag>{file.changeType}</Tag>
                </List.Item>
              )}
            />
          ),
          rowExpandable: (run) => (run.comparison?.changedFiles.length ?? 0) > 0,
        }}
        rowSelection={
          compareMode
            ? {
                selectedRowKeys: picked,
                onChange: (keys) => setPicked(keys.map(String).slice(0, 2)),
                getCheckboxProps: (run) => ({ disabled: run.status !== "completed" }),
              }
            : undefined
        }
        columns={[
          {
            title: "Question",
            dataIndex: "goal",
            render: (goal: string, run) => <Link to={`/runs/${run.id}`}>{goal}</Link>,
          },
          {
            title: "Verdict",
            key: "verdict",
            render: (_, run) =>
              run.status === "completed" ? (
                <Tag color={riskColor(runRisk(run))}>{runRisk(run)}</Tag>
              ) : (
                <Tag>{run.status}</Tag>
              ),
          },
          {
            title: "AI",
            dataIndex: "aiStatus",
            render: (value: string | undefined) => <Tag>{value ?? "—"}</Tag>,
          },
          {
            title: "Issues",
            dataIndex: "findings",
            render: (findings: Array<unknown>) => findings.length,
          },
          {
            title: "Change",
            key: "change",
            render: (_, run) => changePreview(run),
          },
          {
            title: "Compared",
            dataIndex: "currentRef",
            render: (value: string, run) => `${run.baseRef} → ${value}`,
          },
          {
            title: "Created",
            dataIndex: "createdAt",
            render: (value: string) => new Date(value).toLocaleString(),
          },
        ]}
      />
      {compareMode && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Input
            value={compareGoal}
            onChange={(event) => setCompareGoal(event.target.value)}
            placeholder="What should this comparison answer?"
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            disabled={picked.length !== 2 || compareGoal.trim().length === 0}
            loading={compare.isPending}
            onClick={() => {
              compare.mutate(
                {
                  analysisRunAId: picked[0],
                  analysisRunBId: picked[1],
                  goal: compareGoal.trim(),
                },
                { onSuccess: (run) => navigate(`/runs/${run.id}`) },
              );
            }}
          >
            Compare selected
          </Button>
        </div>
      )}
      {compare.error instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={`${compare.error.code}: ${compare.error.message}`}
        />
      )}
      {importRun.error instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={`${importRun.error.code}: ${importRun.error.message}`}
        />
      )}
    </Card>
  );
}
