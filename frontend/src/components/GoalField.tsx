import { Input, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AnalysisLens, Verbosity } from "../api/types.js";

const ROTATING_EXAMPLES = [
  "Will the new zombie HP break Night 3 difficulty?",
  "Did shop prices stay within the economy curve?",
  "Check the new plant skills for balance outliers and missing references",
  "Verify the tier merge changes before the 1.4 patch",
];

const TEMPLATES: Array<{ label: string; text: string }> = [
  {
    label: "Balance check",
    text: "Check this change for game balance: difficulty curve, outliers, and unfair spikes.",
  },
  {
    label: "Economy check",
    text: "Check this change against the game economy: prices, rewards, and progression pacing.",
  },
  {
    label: "New content",
    text: "Review this new content for missing references, invalid values, and consistency with existing data.",
  },
  {
    label: "Bugfix verification",
    text: "Verify this fix resolves the issue without breaking related systems.",
  },
];

export interface ExtraTemplate {
  label: string;
  text: string;
  lens?: AnalysisLens;
  verbosity?: Verbosity;
}

interface GoalFieldProps {
  value: string;
  onChange: (value: string) => void;
  extraTemplates?: ExtraTemplate[];
  onApplyTemplate?: (template: ExtraTemplate) => void;
}

export function GoalField({ value, onChange, extraTemplates, onApplyTemplate }: GoalFieldProps): React.JSX.Element {
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setExampleIndex((index) => (index + 1) % ROTATING_EXAMPLES.length),
      4000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        What should the AI check?
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Describe the change in designer terms — the goal drives the whole review.
      </Typography.Paragraph>
      <Input.TextArea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`e.g. ${ROTATING_EXAMPLES[exampleIndex]}`}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {TEMPLATES.map((template) => (
          <Tag
            key={template.label}
            style={{ cursor: "pointer", padding: "4px 10px" }}
            onClick={() => onChange(template.text)}
          >
            {template.label}
          </Tag>
        ))}
        {(extraTemplates ?? []).map((template) => (
          <Tag
            key={`saved-${template.label}`}
            color="blue"
            style={{ cursor: "pointer", padding: "4px 10px" }}
            onClick={() => {
              if (onApplyTemplate) onApplyTemplate(template);
              else onChange(template.text);
            }}
          >
            {template.label}
          </Tag>
        ))}
      </div>
    </div>
  );
}
