import { Alert, Button, Card, Form, Input, Select } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAnalyses, useCompareMutation } from "../api/hooks.js";
import { ApiError } from "../api/types.js";

export function ComparePage(): React.JSX.Element {
  const analyses = useAnalyses(100);
  const compare = useCompareMutation();
  const navigate = useNavigate();
  const [goal, setGoal] = useState("Compare the two selected runs");
  const completed = (analyses.data ?? []).filter((run) => run.status === "completed");

  return (
    <Card title="Compare two completed runs">
      <Form
        layout="vertical"
        onFinish={(values: { aId: string; bId: string }) => {
          compare.mutate(
            { analysisRunAId: values.aId, analysisRunBId: values.bId, goal },
            { onSuccess: (run) => navigate(`/analyses/${run.id}`) },
          );
        }}
      >
        <Form.Item name="aId" label="Run A" rules={[{ required: true }]}>
          <Select
            placeholder="Select first run"
            options={completed.map((run) => ({
              value: run.id,
              label: `${run.goal} (${run.id.slice(0, 8)})`,
            }))}
          />
        </Form.Item>
        <Form.Item name="bId" label="Run B" rules={[{ required: true }]}>
          <Select
            placeholder="Select second run"
            options={completed.map((run) => ({
              value: run.id,
              label: `${run.goal} (${run.id.slice(0, 8)})`,
            }))}
          />
        </Form.Item>
        <Form.Item label="Goal">
          <Input value={goal} onChange={(event) => setGoal(event.target.value)} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={compare.isPending}>
          Compare
        </Button>
      </Form>
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
