import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  List,
  Select,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useInspectQuery, useWhatIfMutation } from "../api/hooks.js";
import { ApiError, type WhatIfResult } from "../api/types.js";
import { useProjects } from "../app/project-context.js";
import { AiReport } from "../components/AiReport.js";
import { SystemFindings } from "../components/SystemFindings.js";
import {
  loadScenarios,
  newScenarioId,
  saveScenarios,
  type WhatIfScenario,
} from "../whatif/scenarios.js";

const FORM_LABEL: React.CSSProperties = { display: "block", marginBottom: 4 };

export function WhatIfPage(): React.JSX.Element {
  const { active } = useProjects();
  const inspection = useInspectQuery(active?.localPath);
  const whatIf = useWhatIfMutation();

  const [filePath, setFilePath] = useState("");
  const [baseRef, setBaseRef] = useState("HEAD");
  const [keyColumn, setKeyColumn] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [column, setColumn] = useState("");
  const [newValue, setNewValue] = useState("");
  const [goal, setGoal] = useState("");
  const [pinned, setPinned] = useState<WhatIfResult | null>(null);
  const [scenarios, setScenarios] = useState<WhatIfScenario[]>(() => loadScenarios());

  const csvFiles = useMemo(
    () =>
      (inspection.data?.files ?? [])
        .filter((file) => file.relativePath.toLowerCase().endsWith(".csv"))
        .map((file) => file.relativePath)
        .sort(),
    [inspection.data],
  );
  const projectScenarios = useMemo(
    () => scenarios.filter((scenario) => scenario.projectId === active?.id),
    [scenarios, active],
  );

  if (!active) {
    return (
      <Empty description="No project selected — pick one from Overview first.">
        <Link to="/">
          <Button type="primary">Go to Overview</Button>
        </Link>
      </Empty>
    );
  }

  const result = whatIf.data ?? pinned;
  const canRun =
    filePath.trim().length > 0 &&
    keyValue.trim().length > 0 &&
    column.trim().length > 0 &&
    newValue.length > 0 &&
    !whatIf.isPending;

  const runScenario = (): void => {
    setPinned(null);
    whatIf.mutate({
      localPath: active.localPath,
      baseRef: baseRef.trim().length > 0 ? baseRef.trim() : undefined,
      filePath: filePath.trim(),
      keyColumn: keyColumn.trim().length > 0 ? keyColumn.trim() : undefined,
      keyValue: keyValue.trim(),
      column: column.trim(),
      newValue,
      goal: goal.trim().length > 0 ? goal.trim() : undefined,
    });
  };

  const saveScenario = (): void => {
    if (!result) return;
    const scenario: WhatIfScenario = {
      id: newScenarioId(),
      projectId: active.id,
      filePath: filePath.trim(),
      baseRef: baseRef.trim().length > 0 ? baseRef.trim() : "HEAD",
      keyColumn: keyColumn.trim(),
      keyValue: keyValue.trim(),
      column: column.trim(),
      newValue,
      goal: goal.trim(),
      result,
      createdAt: new Date().toISOString(),
    };
    const next = [scenario, ...scenarios];
    setScenarios(next);
    saveScenarios(next);
  };

  const loadScenario = (scenario: WhatIfScenario): void => {
    setFilePath(scenario.filePath);
    setBaseRef(scenario.baseRef);
    setKeyColumn(scenario.keyColumn);
    setKeyValue(scenario.keyValue);
    setColumn(scenario.column);
    setNewValue(scenario.newValue);
    setGoal(scenario.goal);
    setPinned(scenario.result ?? null);
    whatIf.reset();
  };

  const deleteScenario = (id: string): void => {
    const next = scenarios.filter((scenario) => scenario.id !== id);
    setScenarios(next);
    saveScenarios(next);
  };

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>
        What-if Lab
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Test a single config edit before touching the repo. The edit is applied in memory only —
        nothing is written to {active.name}.
      </Typography.Paragraph>

      <Card title="Hypothetical edit">
        {inspection.isLoading && <Skeleton active />}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 280px" }}>
            <Typography.Text strong style={FORM_LABEL}>
              Config file
            </Typography.Text>
            <Input
              value={filePath}
              onChange={(event) => setFilePath(event.target.value)}
              placeholder="Assets/CSV/ShopData.csv"
            />
            {csvFiles.length > 0 && (
              <Select
                showSearch
                allowClear
                placeholder="Pick from project CSVs"
                style={{ width: "100%", marginTop: 6 }}
                value={undefined}
                onChange={(value: string) => setFilePath(value)}
                options={csvFiles.map((path) => ({ value: path, label: path }))}
              />
            )}
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Typography.Text strong style={FORM_LABEL}>
              Base ref
            </Typography.Text>
            <Input value={baseRef} onChange={(event) => setBaseRef(event.target.value)} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Typography.Text strong style={FORM_LABEL}>
              Key column (optional)
            </Typography.Text>
            <Input
              value={keyColumn}
              onChange={(event) => setKeyColumn(event.target.value)}
              placeholder="Id"
            />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Typography.Text strong style={FORM_LABEL}>
              Key value
            </Typography.Text>
            <Input
              value={keyValue}
              onChange={(event) => setKeyValue(event.target.value)}
              placeholder="1"
            />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Typography.Text strong style={FORM_LABEL}>
              Column
            </Typography.Text>
            <Input
              value={column}
              onChange={(event) => setColumn(event.target.value)}
              placeholder="Price"
            />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Typography.Text strong style={FORM_LABEL}>
              New value
            </Typography.Text>
            <Input value={newValue} onChange={(event) => setNewValue(event.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Typography.Text strong style={FORM_LABEL}>
            Context for the AI (optional)
          </Typography.Text>
          <Input.TextArea
            rows={2}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="e.g. This is for the mid-game economy rebalance."
          />
        </div>
        <Button
          type="primary"
          size="large"
          block
          style={{ marginTop: 12 }}
          disabled={!canRun}
          loading={whatIf.isPending}
          onClick={runScenario}
        >
          Evaluate this edit
        </Button>
        {whatIf.error instanceof ApiError && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message={`${whatIf.error.code}: ${whatIf.error.message}`}
          />
        )}
      </Card>

      {whatIf.isPending && <Skeleton active style={{ marginTop: 16 }} />}
      {result && (
        <Card
          title={
            <span>
              {result.filePath} · {result.keyColumn}={result.keyValue} · {result.column}:{" "}
              <Typography.Text delete>{result.oldValue}</Typography.Text> →{" "}
              <Tag color="blue">{result.newValue}</Tag>
            </span>
          }
          extra={
            <span style={{ display: "flex", gap: 8 }}>
              <Tag>AI: {result.aiStatus.replace(/_/g, " ")}</Tag>
              <Button size="small" onClick={saveScenario}>
                Save scenario
              </Button>
            </span>
          }
          style={{ marginTop: 16 }}
        >
          {result.error && <Alert type="error" showIcon message={result.error} />}
          {result.findings.length > 0 ? (
            <SystemFindings findings={result.findings} />
          ) : (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 12 }}
              message="Deterministic checks pass — no structural problems with this edit."
            />
          )}
          {result.aiReport !== undefined && result.aiReport !== null && (
            <div style={{ marginTop: 12 }}>
              <AiReport report={result.aiReport} />
            </div>
          )}
        </Card>
      )}

      <Card title={`Saved scenarios (${projectScenarios.length})`} style={{ marginTop: 16 }}>
        {projectScenarios.length === 0 ? (
          <Empty description="No saved scenarios — evaluate an edit, then save it." />
        ) : (
          <List
            dataSource={projectScenarios}
            renderItem={(scenario) => (
              <List.Item
                actions={[
                  <Button key="load" type="link" size="small" onClick={() => loadScenario(scenario)}>
                    Load
                  </Button>,
                  <Button
                    key="delete"
                    type="link"
                    size="small"
                    danger
                    onClick={() => deleteScenario(scenario.id)}
                  >
                    Delete
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={`${scenario.filePath} · ${scenario.column}: ${scenario.newValue}`}
                  description={`${scenario.keyValue ? `${scenario.keyColumn || "key"}=${scenario.keyValue} · ` : ""}${new Date(scenario.createdAt).toLocaleString()}`}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
