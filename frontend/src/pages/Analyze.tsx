import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  useAnalyses,
  useHealth,
  useInspectMutation,
  useInspectQuery,
  useStartAnalysisMutation,
} from "../api/hooks.js";
import { ApiError, type NormalizedAiReport } from "../api/types.js";
import { useProjects } from "../app/project-context.js";
import { FolderBrowser } from "../components/FolderBrowser.js";
import { GoalField } from "../components/GoalField.js";
import { RefPicker } from "../components/RefPicker.js";
import { riskColor } from "../components/system-map.js";
import { newProjectId, projectNameFromPath } from "../projects/registry.js";

function runRisk(run: { aiReport?: unknown }): string {
  const report = run.aiReport as NormalizedAiReport | undefined;
  return report?.summary?.risk_level ?? "unknown";
}

export function AnalyzePage(): React.JSX.Element {
  const navigate = useNavigate();
  const health = useHealth();
  const { projects, active, addProject, removeProject, setActive, updateProject } = useProjects();
  const startAnalysis = useStartAnalysisMutation();
  const inspectMutation = useInspectMutation();

  const [selectedId, setSelectedId] = useState<string | null>(active?.id ?? null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [goal, setGoal] = useState(active?.lastGoal ?? "");
  const [baseRef, setBaseRef] = useState(active?.lastBaseRef ?? "HEAD~1");
  const [currentRef, setCurrentRef] = useState(active?.lastCurrentRef ?? "WORKTREE");
  const [addError, setAddError] = useState<string | null>(null);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const inspection = useInspectQuery(selected?.localPath);

  useEffect(() => {
    if (selectedId === null && projects.length > 0) {
      setSelectedId(projects[projects.length - 1].id);
    }
  }, [projects, selectedId]);

  const pickProject = (id: string): void => {
    const project = projects.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setActive(id);
    setGoal(project?.lastGoal ?? "");
    setBaseRef(project?.lastBaseRef ?? "HEAD~1");
    setCurrentRef(project?.lastCurrentRef ?? "WORKTREE");
    setAddError(null);
  };

  const handleSelectPath = (path: string): void => {
    setAddError(null);
    inspectMutation.mutate(path, {
      onSuccess: (result) => {
        const project = {
          id: newProjectId(),
          name: projectNameFromPath(result.rootPath),
          localPath: result.rootPath,
          addedAt: new Date().toISOString(),
        };
        addProject(project);
        setSelectedId(project.id);
        setGoal("");
        setBaseRef("HEAD~1");
        setCurrentRef("WORKTREE");
        setBrowserOpen(false);
      },
      onError: (error) => {
        setAddError(error instanceof Error ? error.message : "Could not add this project.");
      },
    });
  };

  const recentRuns = useAnalyses(20);
  const projectRuns = useMemo(
    () =>
      (recentRuns.data ?? [])
        .filter((run) => selected !== null && run.localPath === selected.localPath)
        .slice(0, 5),
    [recentRuns.data, selected],
  );

  const canRun =
    selected !== null &&
    goal.trim().length > 0 &&
    inspection.data !== undefined &&
    !inspection.isLoading &&
    !startAnalysis.isPending;

  return (
    <div>
      <GoalField value={goal} onChange={setGoal} />

      <Typography.Title level={4} style={{ marginTop: 20, marginBottom: 4 }}>
        Which project?
      </Typography.Title>
      {projects.length === 0 ? (
        <Empty description="No projects yet — add your game repository to begin.">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setBrowserOpen(true)}>
            Add project
          </Button>
        </Empty>
      ) : (
        <Row gutter={[12, 12]}>
          {projects.map((project) => {
            const isSelected = project.id === selectedId;
            return (
              <Col key={project.id} xs={24} sm={12} lg={8}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => pickProject(project.id)}
                  style={isSelected ? { borderColor: "#1677ff", borderWidth: 2 } : undefined}
                  title={project.name}
                  extra={
                    isSelected ? (
                      <Tag color="blue">selected</Tag>
                    ) : (
                      <Button
                        type="link"
                        size="small"
                        danger
                        onClick={(event) => {
                          event.stopPropagation();
                          removeProject(project.id);
                        }}
                      >
                        Remove
                      </Button>
                    )
                  }
                >
                  <Typography.Text code ellipsis style={{ fontSize: 12, maxWidth: "100%" }}>
                    {project.localPath}
                  </Typography.Text>
                </Card>
              </Col>
            );
          })}
          <Col xs={24} sm={12} lg={8}>
            <Card
              size="small"
              hoverable
              onClick={() => setBrowserOpen(true)}
              style={{ borderStyle: "dashed", textAlign: "center", height: "100%" }}
            >
              <Button type="link" icon={<PlusOutlined />}>
                Add project
              </Button>
            </Card>
          </Col>
        </Row>
      )}

      {addError !== null && (
        <Alert type="error" showIcon message={addError} style={{ marginTop: 12 }} />
      )}
      {inspectMutation.isPending && <Skeleton active style={{ marginTop: 12 }} />}

      {selected !== null && (
        <Card title={`Reviewing: ${selected.name}`} style={{ marginTop: 16 }}>
          {inspection.isLoading && <Skeleton active />}
          {inspection.error instanceof ApiError && (
            <Alert
              type="error"
              showIcon
              message={`${inspection.error.code}: ${inspection.error.message}`}
            />
          )}
          {inspection.data && (
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Tag>Branch: {inspection.data.repository.branch}</Tag>
                <Tag>HEAD: {inspection.data.repository.headCommit.slice(0, 12)}</Tag>
                {inspection.data.repository.hasUncommittedChanges && (
                  <Tag color="orange">uncommitted changes</Tag>
                )}
                <Tag>
                  {inspection.data.summary.configFiles} data files ·{" "}
                  {inspection.data.summary.sourceFiles} code files
                </Tag>
              </div>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <RefPicker
                    localPath={selected.localPath}
                    label="Base — compare from"
                    value={baseRef}
                    onChange={setBaseRef}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <RefPicker
                    localPath={selected.localPath}
                    label="Current — compare to"
                    value={currentRef}
                    onChange={setCurrentRef}
                  />
                </Col>
              </Row>
              <Button
                type="primary"
                size="large"
                block
                style={{ marginTop: 16 }}
                disabled={!canRun}
                loading={startAnalysis.isPending}
                onClick={() => {
                  if (selected === null) return;
                  startAnalysis.mutate(
                    {
                      localPath: selected.localPath,
                      baseRef,
                      currentRef,
                      goal: goal.trim(),
                    },
                    {
                      onSuccess: (run) => {
                        updateProject(selected.id, {
                          lastGoal: goal.trim(),
                          lastBaseRef: baseRef,
                          lastCurrentRef: currentRef,
                        });
                        navigate(`/runs/${run.id}`);
                      },
                    },
                  );
                }}
              >
                {health.data?.ai.configured === true
                  ? "Review this change with AI"
                  : "Review this change (AI off — deterministic checks only)"}
              </Button>
              {startAnalysis.error instanceof ApiError && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`${startAnalysis.error.code}: ${startAnalysis.error.message}`}
                />
              )}
            </div>
          )}
        </Card>
      )}

      {selected !== null && projectRuns.length > 0 && (
        <Card title={`Latest verdicts — ${selected.name}`} style={{ marginTop: 16 }}>
          <List
            dataSource={projectRuns}
            renderItem={(run) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Link to={`/runs/${run.id}`}>
                      <Tag color={riskColor(runRisk(run))}>{runRisk(run)}</Tag> {run.goal}
                    </Link>
                  }
                  description={`${run.baseRef} → ${run.currentRef} · ${run.findings.length} findings · ${new Date(run.createdAt).toLocaleString()}`}
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      <FolderBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={handleSelectPath}
      />
    </div>
  );
}
