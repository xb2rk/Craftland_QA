import { Button, Col, Input, Row, Space, Tag, Typography } from "antd";

import { ApiError } from "../../api/types.js";
import { RefPicker } from "../RefPicker.js";
import { SectionCard } from "../ui/SectionCard.js";
import { StatTile } from "../ui/StatTile.js";

export interface ComparePreset {
  id: string;
  label: string;
  baseRef: string;
  currentRef: string;
}

export interface DiffStats {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  untracked: number;
}

/**
 * CompareCard owns the revision-pair selection: base/current ref pickers,
 * repository metadata, saved compare presets, and the change-count stats.
 * The stats intentionally keep showing the previous pair's counts while a
 * new diff loads, so the layout never collapses into a skeleton pop.
 */
export function CompareCard(props: {
  localPath: string;
  baseRef: string;
  currentRef: string;
  onBaseChange: (value: string) => void;
  onCurrentChange: (value: string) => void;
  diffState: "loading" | "error" | "live" | "refreshing";
  diffError: unknown;
  repository?: {
    branch: string;
    headCommit: string;
    hasUncommittedChanges: boolean;
  };
  configFiles?: number;
  sourceFiles?: number;
  changedCount: number;
  diffStats: DiffStats;
  showStats: boolean;
  presets: ComparePreset[];
  presetLabel: string;
  onPresetLabelChange: (value: string) => void;
  onSavePreset: () => void;
  onDeletePreset: (id: string) => void;
  onSelectPreset: (baseRef: string, currentRef: string) => void;
}): React.JSX.Element {
  return (
    <SectionCard
      title="Compare versions"
      description="Pick the two revisions under review — diff, files, AI, and what-if all follow this pair."
      extra={
        <Space size={8} wrap>
          {props.diffState === "loading" ? (
            <Tag color="blue">Loading diff…</Tag>
          ) : props.diffError instanceof ApiError ? (
            <Tag color="red">Diff error</Tag>
          ) : props.diffState === "live" ? (
            <Tag color="green">
              Diff live · {props.changedCount} file{props.changedCount === 1 ? "" : "s"}
            </Tag>
          ) : (
            <Tag>Refreshing diff…</Tag>
          )}
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <RefPicker
            localPath={props.localPath}
            label="Base — compare from"
            value={props.baseRef}
            onChange={props.onBaseChange}
          />
        </Col>
        <Col xs={24} md={12}>
          <RefPicker
            localPath={props.localPath}
            label="Current — compare to"
            value={props.currentRef}
            onChange={props.onCurrentChange}
          />
        </Col>
      </Row>

      {props.repository !== undefined && (
        <Space size={[8, 8]} wrap style={{ marginTop: 12 }}>
          <Tag>Branch: {props.repository.branch}</Tag>
          <Tag>HEAD: {props.repository.headCommit.slice(0, 12)}</Tag>
          {props.repository.hasUncommittedChanges && (
            <Tag color="orange">uncommitted changes</Tag>
          )}
          <Tag>
            {props.configFiles ?? 0} data files · {props.sourceFiles ?? 0} code files
          </Tag>
        </Space>
      )}

      <div style={{ marginTop: 12 }}>
        <Typography.Text strong>Compare presets</Typography.Text>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {props.presets.length === 0 && (
            <Typography.Text type="secondary">
              No presets yet — save the current pair for one-click reuse.
            </Typography.Text>
          )}
          {props.presets.map((preset) => (
            <Tag
              key={preset.id}
              style={{ cursor: "pointer", padding: "4px 10px" }}
              onClick={() => props.onSelectPreset(preset.baseRef, preset.currentRef)}
              closable
              onClose={(event) => {
                event.preventDefault();
                props.onDeletePreset(preset.id);
              }}
            >
              {preset.label}: {preset.baseRef} → {preset.currentRef}
            </Tag>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Input
            placeholder="Preset name, e.g. main vs my branch"
            value={props.presetLabel}
            onChange={(event) => props.onPresetLabelChange(event.target.value)}
            style={{ maxWidth: 320 }}
          />
          <Button disabled={props.presetLabel.trim().length === 0} onClick={props.onSavePreset}>
            Save current pair
          </Button>
        </div>
      </div>

      {props.showStats && (
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={12} sm={8} md={4}>
            <StatTile label="Files changed" value={props.changedCount} />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              label="Added"
              value={props.diffStats.added}
              dim={props.diffStats.added === 0}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              label="Modified"
              value={props.diffStats.modified}
              dim={props.diffStats.modified === 0}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              label="Deleted"
              value={props.diffStats.deleted}
              dim={props.diffStats.deleted === 0}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              label="Renamed"
              value={props.diffStats.renamed}
              dim={props.diffStats.renamed === 0}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              label="Untracked"
              value={props.diffStats.untracked}
              dim={props.diffStats.untracked === 0}
            />
          </Col>
        </Row>
      )}
    </SectionCard>
  );
}
