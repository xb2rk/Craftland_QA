import { Alert, App, Button, Input, Select, Skeleton, Table, Tag, Typography, Upload } from "antd";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAnalyses, useCompareMutation, useImportRunMutation } from "../api/hooks.js";
import { ANALYSIS_LENSES, ApiError, type NormalizedAiReport } from "../api/types.js";
import { riskColor } from "../components/system-map.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { RiskTag } from "../components/ui/RiskTag.js";
import { SectionCard } from "../components/ui/SectionCard.js";
import { StatusDot } from "../components/ui/StatusDot.js";
import { runStatusTone } from "../theme/tokens.js";

function runRisk(run: { aiReport?: unknown }): string {
  const report = run.aiReport as NormalizedAiReport | undefined;
  return report?.summary?.risk_level ?? "—";
}

export function RunsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const analyses = useAnalyses(100);
  const compare = useCompareMutation();
  const importRun = useImportRunMutation();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState<string | undefined>(undefined);
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [compareGoal, setCompareGoal] = useState("Compare the two selected runs");
  const { message } = App.useApp();

  const rows = useMemo(() => {
    return (analyses.data ?? []).filter((run) => {
      if (status !== undefined && run.status !== status) return false;
      if (lens !== undefined && run.lens !== lens) return false;
      if (query.trim().length === 0) return true;
      const needle = query.trim().toLowerCase();
      return (
        run.goal.toLowerCase().includes(needle) ||
        run.localPath.toLowerCase().includes(needle)
      );
    });
  }, [analyses.data, status, query, lens]);

  if (analyses.isLoading) return <Skeleton active />;

  return (
    <div>
      <PageHeader
        eyebrow="History"
        title="Runs"
        description="Every review and comparison — rerun, compare two runs, or import a run from JSON."
      />
      <SectionCard
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
          <Select
            allowClear
            placeholder="Lens"
            value={lens}
            onChange={setLens}
            options={ANALYSIS_LENSES.map((entry) => ({
              value: entry.value,
              label: entry.label,
            }))}
            style={{ width: 170 }}
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
                  onSuccess: (run) => {
                    message.success("Run imported.");
                    navigate(`/runs/${run.id}`);
                  },
                  onError: (error) =>
                    message.error(error instanceof Error ? error.message : "Import failed."),
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
            title: "Status",
            dataIndex: "status",
            render: (value: string) => {
              const tone = runStatusTone(value);
              return <StatusDot color={tone.tone} pulse={tone.pulse} label={value} />;
            },
          },
          {
            title: "Verdict",
            key: "verdict",
            render: (_, run) =>
              run.status === "completed" ? (
                <RiskTag risk={runRisk(run)} />
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
            title: "Lens",
            dataIndex: "lens",
            render: (value: string | undefined) =>
              value ? (
                <Tag color="blue">{value.replace(/_/g, " ")}</Tag>
              ) : (
                <Tag>—</Tag>
              ),
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
      </SectionCard>
    </div>
  );
}
