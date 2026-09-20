import { Select, Table, Tag } from "antd";
import { useMemo, useState } from "react";

import type { Finding } from "../api/types.js";

export function FindingsTable({ findings }: { findings: Finding[] }): React.JSX.Element {
  const [severity, setSeverity] = useState<string | undefined>(undefined);
  const rows = useMemo(
    () =>
      severity === undefined
        ? findings
        : findings.filter((finding) => finding.severity === severity),
    [findings, severity],
  );
  return (
    <div>
      <Select
        allowClear
        placeholder="Filter by severity"
        value={severity}
        onChange={setSeverity}
        options={["error", "warning", "info"].map((value) => ({ value, label: value }))}
        style={{ width: 200, marginBottom: 12 }}
      />
      <Table
        rowKey={(finding) => `${finding.code}-${finding.filePath}-${finding.line ?? 0}-${finding.message}`}
        dataSource={rows}
        columns={[
          { title: "Code", dataIndex: "code" },
          {
            title: "Severity",
            dataIndex: "severity",
            render: (value: string) => <Tag>{value}</Tag>,
          },
          { title: "Message", dataIndex: "message" },
          { title: "File", dataIndex: "filePath" },
          { title: "Line", dataIndex: "line", render: (value?: number) => value ?? "—" },
        ]}
      />
    </div>
  );
}
