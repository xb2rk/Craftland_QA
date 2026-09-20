import { Card, Col, Row, Skeleton, Statistic, Table, Tag } from "antd";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { useAnalyses } from "../api/hooks.js";

export function OverviewPage(): React.JSX.Element {
  const analyses = useAnalyses(100);

  const stats = useMemo(() => {
    const runs = analyses.data ?? [];
    const completed = runs.filter((run) => run.status === "completed").length;
    const failed = runs.filter((run) => run.status === "failed").length;
    const errors = runs.flatMap((run) => run.findings).filter((finding) => finding.severity === "error").length;
    return { total: runs.length, completed, failed, errors };
  }, [analyses.data]);

  const severityData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of analyses.data ?? []) {
      for (const finding of run.findings) {
        counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  }, [analyses.data]);

  if (analyses.isLoading) return <Skeleton active />;

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="Total runs" value={stats.total} /></Card></Col>
        <Col span={6}><Card><Statistic title="Completed" value={stats.completed} /></Card></Col>
        <Col span={6}><Card><Statistic title="Failed" value={stats.failed} /></Card></Col>
        <Col span={6}><Card><Statistic title="Error findings" value={stats.errors} /></Card></Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card title="Findings by severity">
            {severityData.length === 0 ? (
              "No findings yet."
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={severityData} dataKey="value" nameKey="name" label />
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col span={16}>
          <Card title="Recent runs" extra={<Link to="/analyses">View all</Link>}>
            <Table
              rowKey="id"
              pagination={false}
              dataSource={(analyses.data ?? []).slice(0, 8)}
              columns={[
                {
                  title: "Goal",
                  dataIndex: "goal",
                  render: (goal: string, run) => (
                    <Link to={`/analyses/${run.id}`}>{goal}</Link>
                  ),
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  render: (status: string) => <Tag>{status}</Tag>,
                },
                {
                  title: "Findings",
                  dataIndex: "findings",
                  render: (findings: Array<unknown>) => findings.length,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
