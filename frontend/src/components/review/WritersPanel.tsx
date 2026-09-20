import { Alert, Button, Collapse, Input, Segmented, Typography } from "antd";
import { useState } from "react";

import { useWriterMutation } from "../../api/hooks.js";
import { ApiError, type WriterKind } from "../../api/types.js";
import { SectionCard } from "../ui/SectionCard.js";

const KIND_HINTS: Record<WriterKind, string> = {
  commit: "One short message for a single commit — type, scope, and what changed.",
  pr: "A fuller description for a pull request — summary, changes, and how to test.",
};

/**
 * WritersPanel drafts release text for one version in a single guided card:
 * pick the output kind, describe the change in plain words, optionally tune
 * the saved team style, then draft. The backend reads repo conventions
 * (AGENTS.md, CONTRIBUTING.md, PR templates); a deterministic template
 * applies when the AI is off or fails.
 */
export function WritersPanel(props: {
  localPath: string;
  baseRef: string;
  currentRef: string;
  instructions: string;
  onInstructionsChange: (value: string) => void;
}): React.JSX.Element {
  const [kind, setKind] = useState<WriterKind>("commit");
  const [goal, setGoal] = useState("");
  const writer = useWriterMutation();

  const draft = (): void => {
    writer.mutate({
      localPath: props.localPath,
      baseRef: props.baseRef,
      currentRef: props.currentRef,
      kind,
      goal: goal.trim().length > 0 ? goal.trim() : undefined,
      instructions:
        props.instructions.trim().length > 0 ? props.instructions.trim() : undefined,
    });
  };

  return (
    <div>
      <SectionCard
        title="Draft release text"
        description="Answer two questions and get paste-ready text — deterministic template first, AI polish when available."
      >
        <Typography.Text strong>What do you want to write?</Typography.Text>
        <div style={{ marginTop: 8 }}>
          <Segmented<WriterKind>
            options={[
              { value: "commit", label: "Commit message" },
              { value: "pr", label: "PR description" },
            ]}
            value={kind}
            onChange={(value) => setKind(value)}
          />
        </div>
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
          {KIND_HINTS[kind]}
        </Typography.Text>

        <Typography.Text strong style={{ display: "block", marginTop: 16 }}>
          What is this change about?
        </Typography.Text>
        <Input.TextArea
          placeholder="e.g. Added a new Daily reward milestone and lowered early plant prices so new players progress faster"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          rows={3}
          style={{ marginTop: 8 }}
        />

        <Collapse
          ghost
          style={{ marginTop: 8 }}
          items={[
            {
              key: "style",
              label: "Team style (saved per project, optional)",
              children: (
                <Input.TextArea
                  placeholder="e.g. scope = game system, always include a test plan"
                  value={props.instructions}
                  onChange={(event) => props.onInstructionsChange(event.target.value)}
                  rows={2}
                />
              ),
            },
          ]}
        />

        <Button
          type="primary"
          loading={writer.isPending}
          onClick={draft}
          style={{ marginTop: 12 }}
        >
          Draft {kind === "commit" ? "commit message" : "PR description"}
        </Button>
        {writer.error instanceof ApiError && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message={`${writer.error.code}: ${writer.error.message}`}
          />
        )}
      </SectionCard>
      {writer.data && (
        <SectionCard
          title={kind === "commit" ? "Commit message" : "PR description"}
          extra={
            <span>
              {writer.data.conventions.length > 0 && (
                <Typography.Text type="secondary" style={{ marginRight: 8 }}>
                  follows {writer.data.conventions.join(", ")}
                </Typography.Text>
              )}
              {writer.data.aiStatus !== "completed" && (
                <Typography.Text type="secondary">deterministic template</Typography.Text>
              )}
            </span>
          }
          style={{ marginTop: 12 }}
        >
          <Typography.Paragraph copyable style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
            {writer.data.text}
          </Typography.Paragraph>
        </SectionCard>
      )}
    </div>
  );
}
