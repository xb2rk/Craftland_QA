import { Alert, Button, Col, Input, Row, Select, Typography } from "antd";

import type { AnalysisLens, Verbosity } from "../../api/types.js";
import { ApiError } from "../../api/types.js";
import { GoalField, type ExtraTemplate } from "../GoalField.js";
import { LensPicker } from "../LensPicker.js";
import { VerbosityPicker } from "../VerbosityPicker.js";
import { SectionCard } from "../ui/SectionCard.js";

/**
 * AiReviewPanel owns the review-goal form: goal text plus templates, lens,
 * verbosity, focus files, and reviewer notes, ending in the run button.
 * It is presentation-only — ReviewPage keeps the state and the run call.
 */
export function AiReviewPanel(props: {
  goal: string;
  onGoalChange: (value: string) => void;
  extraTemplates: ExtraTemplate[];
  onApplyTemplate: (template: ExtraTemplate) => void;
  lens: AnalysisLens;
  onLensChange: (value: AnalysisLens) => void;
  verbosity: Verbosity;
  onVerbosityChange: (value: Verbosity) => void;
  focusPaths: string[];
  onFocusPathsChange: (value: string[]) => void;
  changedFiles: Array<{ relativePath: string }>;
  notes: string;
  onNotesChange: (value: string) => void;
  canRun: boolean;
  running: boolean;
  aiConfigured: boolean;
  onRun: () => void;
  startError: unknown;
}): React.JSX.Element {
  return (
    <div>
      <SectionCard title="Review goal" style={{ marginBottom: 12 }}>
        <GoalField
          value={props.goal}
          onChange={props.onGoalChange}
          extraTemplates={props.extraTemplates}
          onApplyTemplate={props.onApplyTemplate}
        />
      </SectionCard>
      <SectionCard title="Review options" style={{ marginBottom: 12 }}>
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <LensPicker value={props.lens} onChange={props.onLensChange} />
          </Col>
          <Col xs={24} md={12}>
            <VerbosityPicker value={props.verbosity} onChange={props.onVerbosityChange} />
          </Col>
        </Row>
        <div style={{ marginTop: 12 }}>
          <Typography.Text strong>Focus files (optional)</Typography.Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="All changed files by default"
            value={props.focusPaths}
            onChange={props.onFocusPathsChange}
            style={{ width: "100%", marginTop: 6 }}
            options={props.changedFiles.map((file) => ({
              value: file.relativePath,
              label: file.relativePath,
            }))}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Typography.Text strong>Notes for the reviewer (optional)</Typography.Text>
          <Input.TextArea
            rows={2}
            value={props.notes}
            onChange={(event) => props.onNotesChange(event.target.value)}
            placeholder="e.g. Pay attention to reward pacing; ignore test fixtures."
            style={{ marginTop: 6 }}
          />
        </div>
      </SectionCard>
      <Button
        type="primary"
        size="large"
        block
        disabled={!props.canRun}
        loading={props.running}
        onClick={props.onRun}
      >
        {props.aiConfigured
          ? "Review this change with AI"
          : "Review this change (AI off — deterministic checks only)"}
      </Button>
      {props.startError instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={`${props.startError.code}: ${props.startError.message}`}
        />
      )}
    </div>
  );
}
