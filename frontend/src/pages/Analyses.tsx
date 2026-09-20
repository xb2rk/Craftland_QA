import { Card, Input, Select, Skeleton, Table, Tag } from "antd";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAnalyses } from "../api/hooks.js";

export function AnalysesPage(): React.JSX.Element {
  const analyses = useAnalyses(100);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");

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
      title="Analyses"
      extra={
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            placeholder="Search goal or path"
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
        </div>
      }
    >
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          {
            title: "Goal",
            dataIndex: "goal",
            render: (goal: string, run) => (
              <Link to={`/analyses/${run.id}`}>{goal}</Link>
            ),
          },
          { title: "Kind", dataIndex: "kind", render: (kind: string) => kind ?? "analysis" },
          {
            title: "Status",
            dataIndex: "status",
            render: (value: string) => <Tag>{value}</Tag>,
          },
          {
            title: "AI",
            dataIndex: "aiStatus",
            render: (value: string | undefined) => <Tag>{value ?? "—"}</Tag>,
          },
          {
            title: "Findings",
            dataIndex: "findings",
            render: (findings: Array<unknown>) => findings.length,
          },
          {
            title: "Created",
            dataIndex: "createdAt",
            render: (value: string) => new Date(value).toLocaleString(),
          },
        ]}
      />
    </Card>
  );
}
