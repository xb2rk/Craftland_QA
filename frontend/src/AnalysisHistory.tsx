import { HistoryOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Empty, List, Space, Tag, Typography } from "antd";

import type { AnalysisRun } from "./api";

interface AnalysisHistoryProps {
  runs: AnalysisRun[];
  selectedRunId?: string;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (run: AnalysisRun) => void;
}

export default function AnalysisHistory({
  runs,
  selectedRunId,
  loading,
  onRefresh,
  onSelect
}: AnalysisHistoryProps) {
  return (
    <Card
      title={
        <Space>
          <HistoryOutlined />
          Saved analyses
        </Space>
      }
      extra={
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      }
    >
      {runs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Refresh to load saved analyses."
        />
      ) : (
        <List
          size="small"
          dataSource={runs}
          renderItem={(run) => (
            <List.Item
              className="cursor-pointer rounded-md px-2 hover:bg-slate-50"
              onClick={() => onSelect(run)}
              extra={
                <Tag color={run.id === selectedRunId ? "red" : undefined}>
                  {run.status}
                </Tag>
              }
            >
              <List.Item.Meta
                title={`${run.baseRef} → ${run.currentRef}`}
                description={
                  <Typography.Text type="secondary" ellipsis>
                    {run.goal}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
