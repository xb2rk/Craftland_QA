import { Alert, Card, Descriptions, Skeleton } from "antd";

import { useHealth } from "../api/hooks.js";

export function SettingsPage(): React.JSX.Element {
  const health = useHealth();
  if (health.isLoading) return <Skeleton active />;
  if (health.error instanceof Error) {
    return <Alert type="error" showIcon message={health.error.message} />;
  }
  return (
    <Card title="Backend settings">
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Status">{health.data?.status}</Descriptions.Item>
        <Descriptions.Item label="Persistence">{health.data?.persistence}</Descriptions.Item>
        <Descriptions.Item label="AI configured">
          {health.data?.ai.configured === true ? "Yes" : "No"}
        </Descriptions.Item>
        <Descriptions.Item label="Pending jobs">{health.data?.pendingJobs}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
