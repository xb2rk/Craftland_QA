import { Alert, Button, Card, Descriptions, Form, Input, Skeleton, Table } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useInspectMutation, useStartAnalysisMutation } from "../api/hooks.js";
import { ApiError } from "../api/types.js";

export function ProjectsPage(): React.JSX.Element {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const inspect = useInspectMutation();
  const startAnalysis = useStartAnalysisMutation();
  const [goal, setGoal] = useState("");

  return (
    <div>
      <Card title="Inspect a local Git project">
        <Form
          form={form}
          layout="vertical"
          initialValues={{ localPath: "", baseRef: "HEAD~1", currentRef: "WORKTREE" }}
          onFinish={(values) => inspect.mutate(values.localPath)}
        >
          <Form.Item
            name="localPath"
            label="Local path"
            rules={[{ required: true, message: "Enter a server-local repository path." }]}
          >
            <Input placeholder="C:\repos\my-craftland-project" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={inspect.isPending}>
            Inspect
          </Button>
        </Form>
        {inspect.error instanceof ApiError && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message={`${inspect.error.code}: ${inspect.error.message}`}
          />
        )}
      </Card>

      {inspect.isPending && <Skeleton active style={{ marginTop: 16 }} />}

      {inspect.data && (
        <Card title="Inspection" style={{ marginTop: 16 }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Root">{inspect.data.rootPath}</Descriptions.Item>
            <Descriptions.Item label="Branch">{inspect.data.repository.branch}</Descriptions.Item>
            <Descriptions.Item label="HEAD">{inspect.data.repository.headCommit.slice(0, 12)}</Descriptions.Item>
            <Descriptions.Item label="Dirty">
              {inspect.data.repository.hasUncommittedChanges ? "Yes" : "No"}
            </Descriptions.Item>
            <Descriptions.Item label="Config files">{inspect.data.summary.configFiles}</Descriptions.Item>
            <Descriptions.Item label="Source files">{inspect.data.summary.sourceFiles}</Descriptions.Item>
          </Descriptions>
          <Table
            style={{ marginTop: 12 }}
            rowKey="relativePath"
            pagination={{ pageSize: 10 }}
            dataSource={inspect.data.files}
            columns={[
              { title: "Path", dataIndex: "relativePath" },
              { title: "Kind", dataIndex: "kind" },
              { title: "Bytes", dataIndex: "sizeBytes" },
            ]}
          />
          <Input
            style={{ marginTop: 12 }}
            placeholder="Analysis goal, e.g. Assess impact of plant rebalance"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
          <Button
            type="primary"
            style={{ marginTop: 8 }}
            disabled={goal.trim().length === 0}
            loading={startAnalysis.isPending}
            onClick={() => {
              const values = form.getFieldsValue() as {
                localPath: string;
                baseRef?: string;
                currentRef?: string;
              };
              startAnalysis.mutate(
                {
                  localPath: values.localPath,
                  baseRef: values.baseRef ?? "HEAD~1",
                  currentRef: values.currentRef ?? "WORKTREE",
                  goal: goal.trim(),
                },
                { onSuccess: (run) => navigate(`/analyses/${run.id}`) },
              );
            }}
          >
            Start analysis
          </Button>
        </Card>
      )}
    </div>
  );
}
