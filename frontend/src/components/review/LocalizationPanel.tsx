import { Alert, Button, Input, Skeleton, Tag } from "antd";
import { useState } from "react";

import { useLocalizationMutation } from "../../api/hooks.js";
import { ApiError } from "../../api/types.js";
import { AiReport } from "../AiReport.js";
import { SystemFindings } from "../SystemFindings.js";
import { SectionCard } from "../ui/SectionCard.js";

/**
 * LocalizationPanel runs the localization QA check for one revision:
 * deterministic cross-file checks (duplicate keys, empty values, row
 * widths) plus an AI narrative when the workflow is configured.
 */
export function LocalizationPanel(props: {
  localPath: string;
  baseRef: string;
}): React.JSX.Element {
  const [goal, setGoal] = useState("");
  const localization = useLocalizationMutation();

  const run = (): void => {
    localization.mutate({
      localPath: props.localPath,
      baseRef: props.baseRef,
      goal: goal.trim().length > 0 ? goal.trim() : undefined,
    });
  };

  return (
    <div>
      <SectionCard
        title="Localization QA"
        description="Cross-file key, value, and width checks for one revision — plus an AI summary when available."
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Input
            placeholder="Focus for the check (optional)"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            style={{ maxWidth: 360 }}
          />
          <Button type="primary" loading={localization.isPending} onClick={run}>
            Check localization
          </Button>
          {localization.data && (
            <Tag color={localization.data.findings.length > 0 ? "red" : "green"}>
              {localization.data.filesChecked.length} files ·{" "}
              {localization.data.findings.length} issues
            </Tag>
          )}
        </div>
        {localization.error instanceof ApiError && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message={`${localization.error.code}: ${localization.error.message}`}
          />
        )}
      </SectionCard>
      {localization.isPending && <Skeleton active style={{ marginTop: 12 }} />}
      {localization.data && (
        <div style={{ marginTop: 12 }}>
          <SystemFindings findings={localization.data.findings} />
          {localization.data.aiReport !== undefined &&
            localization.data.aiReport !== null && (
              <div style={{ marginTop: 12 }}>
                <AiReport report={localization.data.aiReport} />
              </div>
            )}
        </div>
      )}
    </div>
  );
}
