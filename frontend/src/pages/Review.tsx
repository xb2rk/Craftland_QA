import {
  Alert,
  App,
  Button,
  Col,
  Empty,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  useHealth,
  useInspectQuery,
  useProjectDiffMutation,
  useStartAnalysisMutation,
} from "../api/hooks.js";
import { ApiError, type AnalysisLens, type Verbosity } from "../api/types.js";
import { useProjects } from "../app/project-context.js";
import { DiffViewer } from "../components/DiffViewer.js";
import { GoalField, type ExtraTemplate } from "../components/GoalField.js";
import { LensPicker } from "../components/LensPicker.js";
import { RefPicker } from "../components/RefPicker.js";
import { SectionCard } from "../components/ui/SectionCard.js";
import { StatTile } from "../components/ui/StatTile.js";
import { VerbosityPicker } from "../components/VerbosityPicker.js";
import { WhatIfThread } from "../components/WhatIfThread.js";
import { newProjectId } from "../projects/registry.js";
import { loadSettings } from "../settings/store.js";

function changeTypeColor(changeType: string): string {
  switch (changeType) {
    case "added":
      return "green";
    case "modified":
      return "blue";
    case "deleted":
      return "red";
    case "renamed":
      return "orange";
    default:
      return "default";
  }
}

export function ReviewPage(): React.JSX.Element {
  const navigate = useNavigate();
  const health = useHealth();
  const { active, updateProject } = useProjects();
  const startAnalysis = useStartAnalysisMutation();
  const projectDiff = useProjectDiffMutation();
  const settings = useMemo(() => loadSettings(), []);

  const [goal, setGoal] = useState(active?.lastGoal ?? "");
  const [baseRef, setBaseRef] = useState(active?.lastBaseRef ?? "HEAD~1");
  const [currentRef, setCurrentRef] = useState(active?.lastCurrentRef ?? "WORKTREE");
  const [lens, setLens] = useState<AnalysisLens>(
    (active?.lastLens as AnalysisLens | undefined) ?? settings.defaultLens,
  );
  const [verbosity, setVerbosity] = useState<Verbosity>(
    (active?.lastVerbosity as Verbosity | undefined) ?? settings.verbosity,
  );
  const [notes, setNotes] = useState("");
  const [focusPaths, setFocusPaths] = useState<string[]>([]);
  const [presetLabel, setPresetLabel] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "whatif" ? "whatif" : "ai");
  const { message } = App.useApp();

  const copyPath = (value: string): void => {
    try {
      const result = navigator.clipboard?.writeText(value);
      if (result) {
        void result.then(
          () => message.success("Path copied."),
          () => message.error("Could not copy the path."),
        );
      }
    } catch {
      message.error("Could not copy the path.");
    }
  };

  const switchTab = (key: string): void => {
    setTab(key);
    setSearchParams(key === "ai" ? {} : { tab: key }, { replace: true });
  };

  const activeId = active?.id;
  useEffect(() => {
    setGoal(active?.lastGoal ?? "");
    setBaseRef(active?.lastBaseRef ?? "HEAD~1");
    setCurrentRef(active?.lastCurrentRef ?? "WORKTREE");
    setLens((active?.lastLens as AnalysisLens | undefined) ?? settings.defaultLens);
    setVerbosity((active?.lastVerbosity as Verbosity | undefined) ?? settings.verbosity);
    setNotes("");
    setFocusPaths([]);
    setPresetLabel("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const localPath = active?.localPath;
  const inspection = useInspectQuery(localPath);
  const inspectionReady = inspection.data !== undefined;

  useEffect(() => {
    if (localPath && inspectionReady) {
      projectDiff.mutate({ localPath, baseRef, currentRef });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPath, baseRef, currentRef, inspectionReady]);

  const diffFresh =
    projectDiff.data !== undefined &&
    projectDiff.variables?.localPath === localPath &&
    projectDiff.variables?.baseRef === baseRef &&
    projectDiff.variables?.currentRef === currentRef;
  const diffError = projectDiff.error;
  const startError = startAnalysis.error;
  const changedFiles = diffFresh && projectDiff.data ? projectDiff.data.changedFiles : [];

  const diffStats = useMemo(() => {
    const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0 };
    for (const file of changedFiles) counts[file.changeType] += 1;
    return counts;
  }, [changedFiles]);

  const extraTemplates: ExtraTemplate[] = useMemo(
    () =>
      settings.templates.map((template) => ({
        label: template.name,
        text: template.goal,
        lens: template.lens,
        verbosity: template.verbosity,
      })),
    [settings],
  );

  const presets = active?.comparePresets ?? [];

  if (!active) {
    return (
      <Empty description="No project selected — pick one from Overview first.">
        <Link to="/">
          <Button type="primary">Go to Overview</Button>
        </Link>
      </Empty>
    );
  }

  const canRun =
    goal.trim().length > 0 && inspectionReady && !inspection.isLoading && !startAnalysis.isPending;

  const runReview = (): void => {
    startAnalysis.mutate(
      {
        localPath: active.localPath,
        baseRef,
        currentRef,
        goal: goal.trim(),
        lens,
        verbosity,
        focusPaths,
        notes: notes.trim().length > 0 ? notes.trim() : undefined,
      },
      {
        onSuccess: (run) => {
          updateProject(active.id, {
            lastGoal: goal.trim(),
            lastBaseRef: baseRef,
            lastCurrentRef: currentRef,
            lastLens: lens,
            lastVerbosity: verbosity,
          });
          navigate(`/runs/${run.id}`);
        },
      },
    );
  };

  const toggleFocus = (path: string): void => {
    setFocusPaths((current) =>
      current.includes(path) ? current.filter((entry) => entry !== path) : [...current, path],
    );
  };

  return (
    <div>
      <SectionCard
        style={{
          position: "sticky",
          top: 64,
          zIndex: 4,
        }}
        bodyStyle={{ padding: "10px 20px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Typography.Text strong>{active.name}</Typography.Text>
          <Tag>
            {baseRef} → {currentRef}
          </Tag>
          <Tag color="blue">{lens.replace(/_/g, " ")}</Tag>
          <Tag>{verbosity}</Tag>
          {focusPaths.length > 0 && <Tag color="purple">{focusPaths.length} focused</Tag>}
          <Button
            type="primary"
            size="small"
            style={{ marginLeft: "auto" }}
            disabled={!canRun}
            loading={startAnalysis.isPending}
            onClick={runReview}
          >
            {health.data?.ai.configured === true ? "Review with AI" : "Review (AI off)"}
          </Button>
        </div>
      </SectionCard>

      {inspection.isLoading && <Skeleton active />}
      {inspection.error instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${inspection.error.code}: ${inspection.error.message}`}
        />
      )}

      <SectionCard
        title="Compare versions"
        description="Pick the two revisions under review — diff, files, AI, and what-if all follow this pair."
        extra={
          <Space size={8} wrap>
            {projectDiff.isPending ? (
              <Tag color="blue">Loading diff…</Tag>
            ) : diffError instanceof ApiError ? (
              <Tag color="red">Diff error</Tag>
            ) : diffFresh ? (
              <Tag color="green">
                Diff live · {changedFiles.length} file{changedFiles.length === 1 ? "" : "s"}
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
              localPath={active.localPath}
              label="Base — compare from"
              value={baseRef}
              onChange={setBaseRef}
            />
          </Col>
          <Col xs={24} md={12}>
            <RefPicker
              localPath={active.localPath}
              label="Current — compare to"
              value={currentRef}
              onChange={setCurrentRef}
            />
          </Col>
        </Row>

        {inspection.data && (
          <Space size={[8, 8]} wrap style={{ marginTop: 12 }}>
            <Tag>Branch: {inspection.data.repository.branch}</Tag>
            <Tag>HEAD: {inspection.data.repository.headCommit.slice(0, 12)}</Tag>
            {inspection.data.repository.hasUncommittedChanges && (
              <Tag color="orange">uncommitted changes</Tag>
            )}
            <Tag>
              {inspection.data.summary.configFiles} data files ·{" "}
              {inspection.data.summary.sourceFiles} code files
            </Tag>
          </Space>
        )}

        <div style={{ marginTop: 12 }}>
          <Typography.Text strong>Compare presets</Typography.Text>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {presets.length === 0 && (
              <Typography.Text type="secondary">
                No presets yet — save the current pair for one-click reuse.
              </Typography.Text>
            )}
            {presets.map((preset) => (
              <Tag
                key={preset.id}
                style={{ cursor: "pointer", padding: "4px 10px" }}
                onClick={() => {
                  setBaseRef(preset.baseRef);
                  setCurrentRef(preset.currentRef);
                }}
                closable
                onClose={(event) => {
                  event.preventDefault();
                  updateProject(active.id, {
                    comparePresets: presets.filter((entry) => entry.id !== preset.id),
                  });
                }}
              >
                {preset.label}: {preset.baseRef} → {preset.currentRef}
              </Tag>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Input
              placeholder="Preset name, e.g. main vs my branch"
              value={presetLabel}
              onChange={(event) => setPresetLabel(event.target.value)}
              style={{ maxWidth: 320 }}
            />
            <Button
              disabled={presetLabel.trim().length === 0}
              onClick={() => {
                updateProject(active.id, {
                  comparePresets: [
                    ...presets,
                    {
                      id: newProjectId(),
                      label: presetLabel.trim(),
                      baseRef,
                      currentRef,
                    },
                  ],
                });
                setPresetLabel("");
              }}
            >
              Save current pair
            </Button>
          </div>
        </div>

        {diffFresh && changedFiles.length > 0 && (
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={12} sm={8} md={4}>
              <StatTile label="Files changed" value={changedFiles.length} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatTile
                label="Added"
                value={diffStats.added}
                dim={diffStats.added === 0}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatTile
                label="Modified"
                value={diffStats.modified}
                dim={diffStats.modified === 0}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatTile
                label="Deleted"
                value={diffStats.deleted}
                dim={diffStats.deleted === 0}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatTile
                label="Renamed"
                value={diffStats.renamed}
                dim={diffStats.renamed === 0}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatTile
                label="Untracked"
                value={diffStats.untracked}
                dim={diffStats.untracked === 0}
              />
            </Col>
          </Row>
        )}
      </SectionCard>

      {inspection.data && (
        <SectionCard bodyStyle={{ paddingTop: 8 }}>
          <Tabs
            activeKey={tab}
            onChange={switchTab}
            items={[
              {
                key: "ai",
                label: "AI Review",
                children: (
                  <div>
                    <SectionCard title="Review goal" style={{ marginBottom: 12 }}>
                      <GoalField
                        value={goal}
                        onChange={setGoal}
                        extraTemplates={extraTemplates}
                        onApplyTemplate={(template) => {
                          setGoal(template.text);
                          if (template.lens) setLens(template.lens);
                          if (template.verbosity) setVerbosity(template.verbosity);
                        }}
                      />
                    </SectionCard>
                    <SectionCard title="Review options" style={{ marginBottom: 12 }}>
                      <Row gutter={[16, 0]}>
                        <Col xs={24} md={12}>
                          <LensPicker value={lens} onChange={setLens} />
                        </Col>
                        <Col xs={24} md={12}>
                          <VerbosityPicker value={verbosity} onChange={setVerbosity} />
                        </Col>
                      </Row>
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text strong>Focus files (optional)</Typography.Text>
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="All changed files by default"
                          value={focusPaths}
                          onChange={setFocusPaths}
                          style={{ width: "100%", marginTop: 6 }}
                          options={changedFiles.map((file) => ({
                            value: file.relativePath,
                            label: file.relativePath,
                          }))}
                        />
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text strong>Notes for the reviewer (optional)</Typography.Text>
                        <Input.TextArea
                          rows={2}
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          placeholder="e.g. Pay attention to reward pacing; ignore test fixtures."
                          style={{ marginTop: 6 }}
                        />
                      </div>
                    </SectionCard>
                    <Button
                      type="primary"
                      size="large"
                      block
                      disabled={!canRun}
                      loading={startAnalysis.isPending}
                      onClick={runReview}
                    >
                      {health.data?.ai.configured === true
                        ? "Review this change with AI"
                        : "Review this change (AI off — deterministic checks only)"}
                    </Button>
                    {startError instanceof ApiError && (
                      <Alert
                        type="error"
                        showIcon
                        style={{ marginTop: 12 }}
                        message={`${startError.code}: ${startError.message}`}
                      />
                    )}
                  </div>
                ),
              },
              {
                key: "diff",
                label: "Git Diff",
                children: projectDiff.isPending ||
                (!diffFresh && projectDiff.data === undefined) ? (
                  <Skeleton active />
                ) : diffError instanceof ApiError ? (
                  <Alert
                    type="error"
                    showIcon
                    message={`${diffError.code}: ${diffError.message}`}
                  />
                ) : (
                  <SectionCard title="Unified diff">
                    <DiffViewer
                      diff={diffFresh ? projectDiff.data?.unifiedDiff : undefined}
                      truncated={projectDiff.data?.diffTruncated}
                      files={diffFresh ? changedFiles : undefined}
                    />
                  </SectionCard>
                ),
              },
              {
                key: "files",
                label: `Files Changed (${changedFiles.length})`,
                children:
                  changedFiles.length === 0 ? (
                    <Empty description="No changed files for this pair — or the diff is still loading." />
                  ) : (
                    <SectionCard title="Changed files">
                      <Table
                        rowKey="relativePath"
                        pagination={{ pageSize: 20 }}
                        dataSource={changedFiles}
                        columns={[
                          {
                            title: "File",
                            dataIndex: "relativePath",
                            render: (value: string) => (
                              <Typography.Text code style={{ fontSize: 12 }}>
                                {value}
                              </Typography.Text>
                            ),
                          },
                          {
                            title: "Change",
                            dataIndex: "changeType",
                            render: (value: string) => (
                              <Tag color={changeTypeColor(value)}>{value}</Tag>
                            ),
                          },
                          {
                            title: "Was",
                            dataIndex: "previousPath",
                            render: (value?: string) => value ?? "—",
                          },
                          {
                            title: "Actions",
                            key: "actions",
                            render: (_, file) => (
                              <span style={{ display: "flex", gap: 4 }}>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => toggleFocus(file.relativePath)}
                                >
                                  {focusPaths.includes(file.relativePath) ? "Unfocus" : "Focus"}
                                </Button>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => copyPath(file.relativePath)}
                                >
                                  Copy path
                                </Button>
                              </span>
                            ),
                          },
                        ]}
                      />
                    </SectionCard>
                  ),
              },
              {
                key: "whatif",
                label: "What-if",
                children: (
                  <WhatIfThread
                    projectId={active.id}
                    projectName={active.name}
                    localPath={active.localPath}
                    baseRef={currentRef}
                  />
                ),
              },
            ]}
          />
        </SectionCard>
      )}
    </div>
  );
}
