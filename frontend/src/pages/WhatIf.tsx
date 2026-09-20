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

const PROMPT_EXAMPLES = [
  "What if sword price goes from 100 to 150 in ShopData?",
  "Set drop rate to 0.05 for the gold chest",
  "Bump Night 3 zombie HP by 50 for id 12",
];

export interface PromptDraft {
  filePath?: string;
  keyColumn?: string;
  keyValue?: string;
  column?: string;
  newValue?: string;
  notes: string[];
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanValue(value: string): string {
  return value.replace(/^[“”"']+|[“”"']+$/g, "").replace(/[.,;!?]+$/g, "");
}

/** Heuristic prompt → structured edit. Only fills what it can defend; the rest stays manual. */
export function draftEditFromPrompt(prompt: string, csvFiles: string[]): PromptDraft {
  const draft: PromptDraft = { notes: [] };
  const flat = normalizeToken(prompt);
  if (flat.length === 0) {
    draft.notes.push("Describe the hypothetical first — e.g. “set Price to 150 for Id 1”.");
    return draft;
  }

  let bestFile: string | undefined;
  let bestScore = 0;
  for (const file of csvFiles) {
    const base = file.split("/").slice(-1)[0] ?? file;
    for (const candidate of [file, base, base.replace(/\.csv$/i, "")]) {
      const token = normalizeToken(candidate);
      if (token.length >= 4 && flat.includes(token) && token.length > bestScore) {
        bestFile = file;
        bestScore = token.length;
      }
    }
  }
  if (bestFile) {
    draft.filePath = bestFile;
    draft.notes.push(`Detected file ${bestFile}.`);
  } else {
    draft.notes.push("No project CSV matched — pick the file below.");
  }

  const setMatch = /set\s+([A-Za-z_]\w*)\s*(?:to|=|→|->)\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/i.exec(
    prompt,
  );
  const changeMatch =
    setMatch === null
      ? /([A-Za-z_]\w*)\s+from\s+[^\s,;]+\s+to\s+(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/i.exec(prompt)
      : null;
  const assignMatch =
    setMatch === null && changeMatch === null
      ? /([A-Za-z_]\w*)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/.exec(prompt)
      : null;
  const bumpMatch =
    setMatch === null && changeMatch === null && assignMatch === null
      ? /(?:bump|raise|increase|lower|decrease|reduce)\s+(?:the\s+)?([A-Za-z_][\w ]*?)\s+by\s+([^\s,;]+)/i.exec(
          prompt,
        )
      : null;

  if (setMatch) {
    draft.column = setMatch[1];
    draft.newValue = cleanValue(setMatch[2] ?? setMatch[3] ?? setMatch[4] ?? "");
  } else if (changeMatch) {
    draft.column = changeMatch[1];
    draft.newValue = cleanValue(changeMatch[2] ?? changeMatch[3] ?? changeMatch[4] ?? "");
  } else if (assignMatch) {
    draft.column = assignMatch[1];
    draft.newValue = cleanValue(assignMatch[2] ?? assignMatch[3] ?? assignMatch[4] ?? "");
  }
  if (draft.column && draft.newValue) {
    draft.notes.push(`Detected ${draft.column} → ${draft.newValue}.`);
  } else if (bumpMatch) {
    draft.column = bumpMatch[1].trim().replace(/\s+/g, "");
    draft.notes.push(
      "That reads as a relative change (“by …”) — confirm the absolute new value below.",
    );
  } else {
    draft.notes.push("No column/value pattern found — try “set Price to 150”.");
  }

  const keyColumnMatch = /\bkey\s+column\s+([A-Za-z_]\w*)/i.exec(prompt);
  if (keyColumnMatch) draft.keyColumn = keyColumnMatch[1];

  const idMatch =
    /(?:\bfor\s+)?\b(id|key)\b\s*[=:#]?\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/i.exec(prompt) ??
    /\bfor\s+"([^"]+)"/i.exec(prompt);
  if (idMatch) {
    const value = cleanValue(idMatch[2] ?? idMatch[3] ?? idMatch[4] ?? idMatch[1] ?? "");
    if (value.length > 0 && value.toLowerCase() !== "id" && value.toLowerCase() !== "key") {
      draft.keyValue = value;
      draft.notes.push(`Detected row key ${value}.`);
    }
  } else {
    draft.notes.push("No row key found — add which row this edit targets.");
  }
  return draft;
}

export function WhatIfPage(): React.JSX.Element {
  const { active } = useProjects();
  const inspection = useInspectQuery(active?.localPath);
  const whatIf = useWhatIfMutation();

  const [prompt, setPrompt] = useState("");
  const [draftNotes, setDraftNotes] = useState<string[]>([]);
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

  const draftFromPrompt = (): void => {
    const draft = draftEditFromPrompt(prompt, csvFiles);
    if (draft.filePath && filePath.trim().length === 0) setFilePath(draft.filePath);
    if (draft.keyColumn && keyColumn.trim().length === 0) setKeyColumn(draft.keyColumn);
    if (draft.keyValue && keyValue.trim().length === 0) setKeyValue(draft.keyValue);
    if (draft.column && column.trim().length === 0) setColumn(draft.column);
    if (draft.newValue && newValue.length === 0) setNewValue(draft.newValue);
    if (prompt.trim().length > 0 && goal.trim().length === 0) setGoal(prompt.trim());
    setDraftNotes(draft.notes);
  };

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
    setPrompt(scenario.goal);
    setDraftNotes([]);
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
        Describe the hypothetical in plain words, confirm the exact edit, then evaluate. The edit
        is applied in memory only — nothing is written to {active.name}.
      </Typography.Paragraph>

      <Card
        title="1 · Describe the hypothetical"
        style={{ marginBottom: 16, boxShadow: "0 1px 6px rgba(15, 23, 42, 0.08)" }}
      >
        <Input.TextArea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="e.g. What if sword price goes from 100 to 150 in ShopData?"
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {PROMPT_EXAMPLES.map((example) => (
            <Tag
              key={example}
              style={{ cursor: "pointer", padding: "4px 10px" }}
              onClick={() => setPrompt(example)}
            >
              {example}
            </Tag>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <div>
            <Typography.Text strong style={FORM_LABEL}>
              Base ref
            </Typography.Text>
            <Input
              value={baseRef}
              onChange={(event) => setBaseRef(event.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <Button type="primary" onClick={draftFromPrompt} disabled={prompt.trim().length === 0}>
              Draft the edit
            </Button>
          </div>
        </div>
        {draftNotes.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="Drafted from your description — confirm below before evaluating."
            description={
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {draftNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            }
          />
        )}
      </Card>

      <Card
        title="2 · Confirm the exact edit"
        style={{ marginBottom: 16, boxShadow: "0 1px 6px rgba(15, 23, 42, 0.08)" }}
      >
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
          style={{ marginTop: 16, boxShadow: "0 1px 6px rgba(15, 23, 42, 0.08)" }}
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

      <Card
        title={`Saved scenarios (${projectScenarios.length})`}
        style={{ marginTop: 16, boxShadow: "0 1px 6px rgba(15, 23, 42, 0.08)" }}
      >
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
