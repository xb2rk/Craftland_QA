import { Alert, App, Button, Empty, Input, Select, Skeleton, Table, Tabs, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import {
  useHealth,
  useInspectQuery,
  useProjectDiffMutation,
  useStartAnalysisMutation,
} from "../api/hooks.js";
import { ApiError, type AnalysisLens, type Verbosity } from "../api/types.js";
import { useProjects } from "../app/project-context.js";
import { DiffViewer } from "../components/DiffViewer.js";
import { type ExtraTemplate } from "../components/GoalField.js";
import { AiReviewPanel } from "../components/review/AiReviewPanel.js";
import { CompareCard } from "../components/review/CompareCard.js";
import { SectionCard } from "../components/ui/SectionCard.js";
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
  const [diffFilter, setDiffFilter] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [fileChange, setFileChange] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(
    initialTab === "diff" || initialTab === "files" ? initialTab : "ai",
  );
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
    setDiffFilter("");
    setFileQuery("");
    setFileChange(null);
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
  // Stale-while-refresh: keep the previous pair's files on screen while the
  // new diff loads, so ref changes never collapse the layout into skeletons.
  const changedFiles =
    projectDiff.data !== undefined && projectDiff.variables?.localPath === localPath
      ? projectDiff.data.changedFiles
      : [];

  const diffStats = useMemo(() => {
    const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0 };
    for (const file of changedFiles) counts[file.changeType] += 1;
    return counts;
  }, [changedFiles]);

  const visibleChangedFiles = useMemo(() => {
    const needle = fileQuery.trim().toLowerCase();
    return changedFiles.filter(
      (file) =>
        (fileChange === null || file.changeType === fileChange) &&
        (needle.length === 0 || file.relativePath.toLowerCase().includes(needle)),
    );
  }, [changedFiles, fileQuery, fileChange]);

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

  // Single-version tools moved to the Version tools page; deep links follow.
  const movedTab =
    initialTab === "whatif" || initialTab === "writers" || initialTab === "localization"
      ? initialTab
      : null;
  if (movedTab !== null) {
    return <Navigate to={`/version?tab=${movedTab}`} replace />;
  }

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

      {inspection.isLoading && !inspection.data && (
        <Skeleton active paragraph={{ rows: 2 }} style={{ marginBottom: 16 }} />
      )}
      {inspection.error instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${inspection.error.code}: ${inspection.error.message}`}
        />
      )}

      <CompareCard
        localPath={active.localPath}
        baseRef={baseRef}
        currentRef={currentRef}
        onBaseChange={(value) => setBaseRef(value)}
        onCurrentChange={(value) => setCurrentRef(value)}
        diffState={projectDiff.isPending ? "loading" : diffFresh ? "live" : "refreshing"}
        diffError={diffError}
        repository={inspection.data?.repository}
        configFiles={inspection.data?.summary.configFiles}
        sourceFiles={inspection.data?.summary.sourceFiles}
        changedCount={changedFiles.length}
        diffStats={diffStats}
        showStats={changedFiles.length > 0}
        presets={presets}
        presetLabel={presetLabel}
        onPresetLabelChange={(value) => setPresetLabel(value)}
        onSavePreset={() => {
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
        onDeletePreset={(id) =>
          updateProject(active.id, {
            comparePresets: presets.filter((entry) => entry.id !== id),
          })
        }
        onSelectPreset={(base, current) => {
          setBaseRef(base);
          setCurrentRef(current);
        }}
      />

      <>
        <SectionCard bodyStyle={{ paddingTop: 8 }}>
          <Tabs
            activeKey={tab}
            onChange={switchTab}
            items={[
              {
                key: "ai",
                label: (
                  <span>
                    <span className="cqa-tabdot cqa-tabdot-ai" />
                    AI Review
                  </span>
                ),
                children: (
                  <div className="cqa-tabpane cqa-tabpane-ai">
                    <AiReviewPanel
                    goal={goal}
                    onGoalChange={(value) => setGoal(value)}
                    extraTemplates={extraTemplates}
                    onApplyTemplate={(template) => {
                      setGoal(template.text);
                      if (template.lens) setLens(template.lens);
                      if (template.verbosity) setVerbosity(template.verbosity);
                    }}
                    lens={lens}
                    onLensChange={(value) => setLens(value)}
                    verbosity={verbosity}
                    onVerbosityChange={(value) => setVerbosity(value)}
                    focusPaths={focusPaths}
                    onFocusPathsChange={(value) => setFocusPaths(value)}
                    changedFiles={changedFiles}
                    notes={notes}
                    onNotesChange={(value) => setNotes(value)}
                    canRun={canRun}
                    running={startAnalysis.isPending}
                    aiConfigured={health.data?.ai.configured === true}
                    onRun={runReview}
                    startError={startError}
                    />
                  </div>
                ),
              },
              {
                key: "diff",
                label: (
                  <span>
                    <span className="cqa-tabdot cqa-tabdot-diff" />
                    Git Diff
                  </span>
                ),
                children: (
                  <div className="cqa-tabpane cqa-tabpane-diff">
                    {projectDiff.data === undefined ? (
                  <SectionCard title="Unified diff">
                    {projectDiff.isPending ? (
                      <div>
                        <Skeleton active />
                        <Typography.Text type="secondary">
                          Loading the {baseRef} → {currentRef} diff…
                        </Typography.Text>
                      </div>
                    ) : diffError instanceof ApiError ? (
                      <Alert
                        type="error"
                        showIcon
                        message={`${diffError.code}: ${diffError.message}`}
                      />
                    ) : (
                      <Empty description="No diff yet — it loads automatically for this pair." />
                    )}
                  </SectionCard>
                ) : (
                  <SectionCard title="Unified diff">
                    {!diffFresh && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message="Showing the previous pair while the new diff loads."
                      />
                    )}
                    <DiffViewer
                      diff={projectDiff.data.unifiedDiff}
                      truncated={projectDiff.data.diffTruncated}
                      files={changedFiles}
                      filter={diffFilter}
                      onFilterChange={setDiffFilter}
                    />
                  </SectionCard>
                    )}
                  </div>
                ),
              },
              {
                key: "files",
                label: (
                  <span>
                    <span className="cqa-tabdot cqa-tabdot-files" />
                    Files Changed ({changedFiles.length})
                  </span>
                ),
                children: (
                  <div className="cqa-tabpane cqa-tabpane-files">
                    {changedFiles.length === 0 ? (
                    <Empty description="No changed files for this pair." />
                  ) : (
                    <SectionCard title="Changed files">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        <Input.Search
                          allowClear
                          placeholder="Search files…"
                          value={fileQuery}
                          onChange={(event) => setFileQuery(event.target.value)}
                          style={{ maxWidth: 280 }}
                        />
                        <Select
                          allowClear
                          placeholder="All change types"
                          value={fileChange}
                          onChange={(value) => setFileChange(value ?? null)}
                          style={{ minWidth: 160 }}
                          options={["added", "modified", "deleted", "renamed", "untracked"].map(
                            (change) => ({ value: change, label: change }),
                          )}
                        />
                      </div>
                      <Table
                        rowKey="relativePath"
                        pagination={{ pageSize: 20 }}
                        dataSource={visibleChangedFiles}
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
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => {
                                    setDiffFilter(file.relativePath);
                                    switchTab("diff");
                                  }}
                                >
                                  View in diff
                                </Button>
                              </span>
                            ),
                          },
                        ]}
                      />
                    </SectionCard>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </SectionCard>
      </>
    </div>
  );
}
