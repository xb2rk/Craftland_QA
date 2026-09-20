import { Alert, Button, Input, Segmented, Typography } from "antd";
import { useState } from "react";

import { useWriterMutation } from "../../api/hooks.js";
import { ApiError, type WriterKind } from "../../api/types.js";
import { SectionCard } from "../ui/SectionCard.js";

/**
 * WritersPanel drafts release text for the pair under review: a
 * conventional-commit message or a PR description. Output is derived from
 * the same diff the review uses; the AI only polishes the wording, and the
 * deterministic template applies when the AI is off or fails.
 */
export function WritersPanel(props: {
  localPath: string;
  baseRef: string;
  currentRef: string;
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
    });
  };

  return (
    <div>
      <SectionCard
        title="Draft release text"
        description="Commit message or PR description for this pair — deterministic template first, AI polish when available."
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Segmented<WriterKind>
            options={[
              { value: "commit", label: "Commit message" },
              { value: "pr", label: "PR description" },
            ]}
            value={kind}
            onChange={(value) => setKind(value)}
          />
          <Input
            placeholder="Context for the writer (optional)"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            style={{ maxWidth: 360 }}
          />
          <Button type="primary" loading={writer.isPending} onClick={draft}>
            Draft {kind === "commit" ? "commit message" : "PR description"}
          </Button>
        </div>
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
            writer.data.aiStatus !== "completed" ? (
              <Typography.Text type="secondary">deterministic template</Typography.Text>
            ) : undefined
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
