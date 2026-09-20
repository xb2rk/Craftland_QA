import { Alert, Button, Card, Input, Select, Skeleton, Table, Tag } from "antd";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAnalyses, useCompareMutation } from "../api/hooks.js";
import { ApiError, type NormalizedAiReport } from "../api/types.js";
import { riskColor } from "../components/system-map.js";

function runRisk(run: { aiReport?: unknown }): string {
  const report = run.aiReport as NormalizedAiReport | undefined;
  return report?.summary?.risk_level ?? "—";
}

export function RunsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const analyses = useAnalyses(100);
  const compare = useCompareMutation();
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
    </Card>
  );
}
