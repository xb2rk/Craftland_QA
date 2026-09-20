import { Button, Card, Checkbox, Empty, Tag, Typography } from "antd";
import { useState } from "react";

import type { AnalysisRun } from "../api/types.js";
import {
  checklistItems,
  exportChecklistMarkdown,
  loadChecklist,
  saveChecklist,
} from "./run-io.js";

export function FixChecklist({ run }: { run: AnalysisRun }): React.JSX.Element {
  const items = checklistItems(run);
  const [checked, setChecked] = useState<string[]>(() => loadChecklist(run.id));

  if (items.length === 0) {
    return (
      <Card title="Fix-it checklist">
        <Empty description="No AI recommendations for this run." />
      </Card>
    );
  }

  const toggle = (id: string): void => {
    const next = checked.includes(id)
      ? checked.filter((item) => item !== id)
      : [...checked, id];
    setChecked(next);
    saveChecklist(run.id, next);
  };

  const done = items.filter((item) => checked.includes(item.id)).length;

  return (
    <Card
      title={`Fix-it checklist (${done}/${items.length})`}
      extra={
        <Button onClick={() => exportChecklistMarkdown(run, checked)}>
          Export markdown
        </Button>
      }
    >
      {items.map((item) => (
        <div key={item.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Checkbox checked={checked.includes(item.id)} onChange={() => toggle(item.id)} />
          <div>
            <Typography.Text delete={checked.includes(item.id)}>
              {item.text}
            </Typography.Text>{" "}
            <Tag>{item.priority}</Tag>
          </div>
        </div>
      ))}
    </Card>
  );
}
