import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Empty, Row, Skeleton, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAnalyses, useInspectMutation } from "../api/hooks.js";
import type { NormalizedAiReport } from "../api/types.js";
import { useProjects } from "../app/project-context.js";
import { FolderBrowser } from "../components/FolderBrowser.js";
import { riskColor } from "../components/system-map.js";
import { newProjectId, projectNameFromPath } from "../projects/registry.js";

function runRisk(run: { aiReport?: unknown }): string {
  const report = run.aiReport as NormalizedAiReport | undefined;
  return report?.summary?.risk_level ?? "unknown";
}

export function OverviewPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { projects, active, addProject, removeProject, setActive } = useProjects();
  const inspectMutation = useInspectMutation();
  const runs = useAnalyses(100);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
        navigate("/review");
      },
      onError: (error) => {
        setAddError(error instanceof Error ? error.message : "Could not add this project.");
      },
    });
  };

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>
        Projects
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Pick a game repository to review — refs, diff, and AI review live on the Review page.
      </Typography.Paragraph>

      {projects.length === 0 ? (
        <Empty description="No projects yet — add your game repository to begin.">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setBrowserOpen(true)}>
            Add project
          </Button>
        </Empty>
      ) : (
        <Row gutter={[12, 12]}>
          {projects.map((project) => {
            const verdict = lastVerdictByPath.get(project.localPath);
            return (
              <Col key={project.id} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  onClick={() => {
                    setActive(project.id);
                    navigate("/review");
                  }}
                  style={
                    project.id === active?.id
                      ? { borderColor: "#1677ff", borderWidth: 2 }
                      : undefined
                  }
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
                  <Typography.Text code ellipsis style={{ fontSize: 12, maxWidth: "100%" }}>
                    {project.localPath}
                  </Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {verdict ? (
                      <Link
                        to={`/runs/${verdict.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Tag color={riskColor(verdict.risk)}>{verdict.risk}</Tag>{" "}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(verdict.at).toLocaleString()}
                        </Typography.Text>
                      </Link>
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        No reviews yet
                      </Typography.Text>
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

      <FolderBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={handleSelectPath}
      />
    </div>
  );
}
