import { PlusOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Col, Input, Row, Skeleton, Tag, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAnalyses, useInspectMutation } from "../api/hooks.js";
import type { NormalizedAiReport } from "../api/types.js";
import { useProjects } from "../app/project-context.js";
import { FolderBrowser } from "../components/FolderBrowser.js";
import { riskColor } from "../components/system-map.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { RiskTag } from "../components/ui/RiskTag.js";
import { StatTile } from "../components/ui/StatTile.js";
import { newProjectId, projectNameFromPath } from "../projects/registry.js";

function runRisk(run: { aiReport?: unknown }): string {
  const report = run.aiReport as NormalizedAiReport | undefined;
  return report?.summary?.risk_level ?? "unknown";
}

export function OverviewPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { projects, active, addProject, removeProject, setActive } = useProjects();
  const inspectMutation = useInspectMutation();
  const runs = useAnalyses(100);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const lastVerdictByPath = useMemo(() => {
    const map = new Map<string, { risk: string; id: string; goal: string; at: string }>();
    for (const run of runs.data ?? []) {
      if (run.status !== "completed" || map.has(run.localPath)) continue;
      map.set(run.localPath, {
        risk: runRisk(run),
        id: run.id,
        goal: run.goal,
        at: run.createdAt,
      });
    }
    return map;
  }, [runs.data]);

  const completedRuns = useMemo(
    () => (runs.data ?? []).filter((run) => run.status === "completed"),
    [runs.data],
  );
  const findingsFlagged = useMemo(
    () => completedRuns.reduce((total, run) => total + run.findings.length, 0),
    [completedRuns],
  );

  const visibleProjects = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(needle) ||
        project.localPath.toLowerCase().includes(needle),
    );
  }, [projects, filter]);

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
        setActive(project.id);
        setBrowserOpen(false);
        message.success(`${project.name} added — pick a ref pair to review.`);
        navigate("/review");
      },
      onError: (error) => {
        const detail = error instanceof Error ? error.message : "Could not add this project.";
        setAddError(detail);
        message.error(detail);
      },
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Pick a game repository to review — refs, diff, AI review, and what-if all live on the Review page."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setBrowserOpen(true)}>
            Add project
          </Button>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={8}>
          <StatTile label="Projects" value={projects.length} />
        </Col>
        <Col xs={12} md={8}>
          <StatTile label="Completed runs" value={completedRuns.length} />
        </Col>
        <Col xs={12} md={8}>
          <StatTile label="Findings flagged" value={findingsFlagged} />
        </Col>
      </Row>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Add your game repository to begin."
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setBrowserOpen(true)}>
              Add project
            </Button>
          }
        />
      ) : (
        <>
          <Input.Search
            allowClear
            placeholder="Filter projects by name or path"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            style={{ maxWidth: 360, marginBottom: 12 }}
          />
          <Row gutter={[12, 12]}>
            {visibleProjects.map((project) => {
              const verdict = lastVerdictByPath.get(project.localPath);
              return (
                <Col key={project.id} xs={24} sm={12} lg={8}>
                  <Card
                    hoverable
                    className="cqa-project-card"
                    onClick={() => {
                      setActive(project.id);
                      navigate("/review");
                    }}
                    style={
                      project.id === active?.id
                        ? { borderColor: "#4f46e5", borderWidth: 2, height: "100%" }
                        : { height: "100%" }
                    }
                    styles={{ body: { minHeight: 132 } }}
                    title={project.name}
                    extra={
                      project.id === active?.id ? (
                        <Tag color="blue">active</Tag>
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
                    <Tooltip title={project.localPath}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          wordBreak: "break-all",
                          marginBottom: 0,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                          background: "rgba(0,0,0,0.04)",
                          borderRadius: 6,
                          padding: "2px 6px",
                        }}
                      >
                        {project.localPath}
                      </span>
                    </Tooltip>
                    <div style={{ marginTop: 8 }}>
                      {verdict ? (
                        <Link
                          to={`/runs/${verdict.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <RiskTag risk={verdict.risk} />{" "}
                          <span style={{ fontSize: 12, color: riskColor(verdict.risk) }}>
                            {new Date(verdict.at).toLocaleString()}
                          </span>
                        </Link>
                      ) : (
                        <span style={{ fontSize: 12, color: "#64748b" }}>No reviews yet</span>
                      )}
                    </div>
                  </Card>
                </Col>
              );
            })}
            <Col xs={24} sm={12} lg={8}>
              <Card
                hoverable
                onClick={() => setBrowserOpen(true)}
                style={{ borderStyle: "dashed", textAlign: "center", height: "100%" }}
                styles={{
                  body: {
                    minHeight: 132,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                }}
              >
                <Button type="link" icon={<PlusOutlined />}>
                  Add project
                </Button>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {addError !== null && (
        <Alert type="error" showIcon message={addError} style={{ marginTop: 12 }} />
      )}
      {inspectMutation.isPending && <Skeleton active style={{ marginTop: 12 }} />}

      <FolderBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={handleSelectPath}
      />
    </div>
  );
}
