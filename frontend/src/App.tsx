import {
  BranchesOutlined,
  CodeOutlined,
  FileSearchOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  ConfigProvider,
  Descriptions,
  Divider,
  Form,
  Input,
  Layout,
  List,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
} from "antd";
import { useState } from "react";

import AnalysisHistory from "./AnalysisHistory";
import {
  inspectProject,
  listAnalysisRuns,
  startAnalysis,
  waitForAnalysis,
  type AnalysisRequest,
  type AnalysisRun,
  type ProjectInspection,
} from "./api";

const { Header, Content } = Layout;
const { TextArea } = Input;

export default function App() {
  const [form] = Form.useForm<AnalysisRequest>();
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRun | null>(null);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [loadingAction, setLoadingAction] = useState<
    "inspect" | "analyze" | "load-runs" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInspect() {
    try {
      setError(null);
      setLoadingAction("inspect");
      const values = await form.validateFields(["localPath"]);
      setInspection(await inspectProject(values.localPath));
    } catch (caught) {
      if (caught instanceof Error) setError(caught.message);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleAnalyze() {
    try {
      setError(null);
      setLoadingAction("analyze");
      const values = await form.validateFields();
      const queued = await startAnalysis(values);
      setAnalysis(queued);
      rememberRun(queued);
      const completed = await waitForAnalysis(queued.id, {
        onProgress: (run) => {
          setAnalysis(run);
          rememberRun(run);
        },
      });
      setAnalysis(completed);
      rememberRun(completed);
    } catch (caught) {
      if (caught instanceof Error) setError(caught.message);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleLoadSavedRuns() {
    try {
      setError(null);
      setLoadingAction("load-runs");
      setAnalysisRuns(await listAnalysisRuns());
    } catch (caught) {
      if (caught instanceof Error) setError(caught.message);
    } finally {
      setLoadingAction(null);
    }
  }

  function rememberRun(run: AnalysisRun) {
    setAnalysisRuns((current) => [
      run,
      ...current.filter((candidate) => candidate.id !== run.id),
    ]);
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#d94841",
          borderRadius: 8,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
      }}
    >
      <Layout className="min-h-screen bg-slate-100">
        <Header className="flex h-auto min-h-16 items-center bg-slate-950 px-5 py-3">
          <Space size="middle">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500 text-white">
              <CodeOutlined className="text-xl" />
            </div>
            <div>
              <Typography.Title level={4} className="!mb-0 !text-white">
                Craftland Quality Analyzer
              </Typography.Title>
            </div>
          </Space>
        </Header>

        <Content className="mx-auto w-full max-w-7xl p-4 md:p-6">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={9}>
              <Space direction="vertical" size="middle" className="w-full">
                <Card
                  title={
                    <Space>
                      <FileSearchOutlined />
                      Compare Git revisions
                    </Space>
                  }
                >
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                      localPath: "",
                      baseRef: "HEAD~1",
                      currentRef: "WORKTREE",
                      goal: "Check config consistency, gameplay impact, flow safety and recovery risks.",
                    }}
                  >
                    <Form.Item
                      label="Local project path"
                      name="localPath"
                      rules={[
                        {
                          required: true,
                          message: "Enter a local Git project path.",
                        },
                      ]}
                    >
                      <Input
                        aria-label="Local project path"
                        placeholder="C:\\Projects\\MyCraftlandGame"
                      />
                    </Form.Item>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item
                          label="Base ref"
                          name="baseRef"
                          rules={[{ required: true }]}
                        >
                          <Input aria-label="Base ref" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          label="Current ref"
                          name="currentRef"
                          rules={[{ required: true }]}
                        >
                          <Input aria-label="Current ref" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Alert
                      className="mb-4"
                      type="info"
                      showIcon
                      message="One run compares Base ref → Current ref"
                      description="Only changed .fcg and .csv files are analyzed. Current can be a commit, branch or WORKTREE."
                    />
                    <Form.Item
                      label="Analysis goal"
                      name="goal"
                      rules={[
                        {
                          required: true,
                          message: "Describe what should be checked.",
                        },
                      ]}
                    >
                      <TextArea
                        aria-label="Analysis goal"
                        autoSize={{ minRows: 4, maxRows: 8 }}
                      />
                    </Form.Item>
                    {error !== null && (
                      <Alert
                        className="mb-4"
                        type="error"
                        showIcon
                        message={error}
                      />
                    )}
                    <Space wrap>
                      <Button
                        icon={<FileSearchOutlined />}
                        loading={loadingAction === "inspect"}
                        onClick={() => void handleInspect()}
                      >
                        Inspect project
                      </Button>
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        loading={loadingAction === "analyze"}
                        onClick={() => void handleAnalyze()}
                      >
                        Run analysis
                      </Button>
                    </Space>
                  </Form>
                </Card>
                <AnalysisHistory
                  runs={analysisRuns}
                  selectedRunId={analysis?.id}
                  loading={loadingAction === "load-runs"}
                  onRefresh={() => void handleLoadSavedRuns()}
                  onSelect={setAnalysis}
                />
              </Space>
            </Col>

            <Col xs={24} lg={15}>
              {inspection === null && analysis === null ? (
                <EmptyState />
              ) : (
                <Space direction="vertical" size="middle" className="w-full">
                  {inspection !== null && (
                    <InspectionSummary inspection={inspection} />
                  )}
                  {analysis !== null && <AnalysisResult analysis={analysis} />}
                </Space>
              )}
            </Col>
          </Row>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

function EmptyState() {
  return (
    <Card className="h-full">
      <div className="flex min-h-80 flex-col items-center justify-center text-center text-slate-500">
        <BranchesOutlined className="mb-4 text-5xl text-slate-300" />
        <Typography.Title level={4}>
          Inspect or analyze a local Git project
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Run analysis directly to see progress and results. Inspect is optional
          and only previews the project tree.
        </Typography.Paragraph>
      </div>
    </Card>
  );
}

function InspectionSummary({ inspection }: { inspection: ProjectInspection }) {
  return (
    <Card>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Statistic
            title="Config files"
            value={inspection.summary.configFiles}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="Source files"
            value={inspection.summary.sourceFiles}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="Other text"
            value={inspection.summary.otherTextFiles}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="Branch" value={inspection.repository.branch} />
        </Col>
      </Row>
      <Typography.Paragraph copyable className="!mb-0 !mt-4">
        {inspection.rootPath}
      </Typography.Paragraph>
      {inspection.repository.hasUncommittedChanges && (
        <Tag color="orange" className="mt-3">
          Includes uncommitted changes
        </Tag>
      )}
    </Card>
  );
}

function AnalysisResult({ analysis }: { analysis: AnalysisRun }) {
  const isFinished =
    analysis.status === "completed" || analysis.status === "failed";
  return (
    <>
      <Card
        title="Base → Current comparison"
        extra={<StatusTag status={analysis.status} />}
      >
        {analysis.comparison === undefined ? (
          <Alert
            type="info"
            showIcon
            message="Analysis is running"
            description="The backend is collecting revision evidence, checking config rules, and then requesting the AI workflow when it is configured."
          />
        ) : (
          <>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                {
                  key: "base",
                  label: "Base commit",
                  children: analysis.comparison.baseCommit.slice(0, 12),
                },
                {
                  key: "current",
                  label: "Current",
                  children: analysis.comparison.currentIsWorktree
                    ? "WORKTREE"
                    : analysis.comparison.currentCommit.slice(0, 12),
                },
                {
                  key: "changed",
                  label: "Changed files",
                  children: analysis.comparison.changedFiles.length,
                },
                {
                  key: "config",
                  label: "Config files scanned",
                  children: analysis.projectSummary?.configFiles ?? "-",
                },
                {
                  key: "ai",
                  label: "AI workflow",
                  children: <AiStatusTag status={analysis.aiStatus} />,
                },
              ]}
            />
            <div className="mt-4 max-h-44 overflow-auto rounded-md bg-slate-50 p-3">
              {analysis.comparison.changedFiles.length === 0 ? (
                <Typography.Text type="secondary">
                  No changed file was found between the selected revisions.
                </Typography.Text>
              ) : (
                analysis.comparison.changedFiles.map((file) => (
                  <div
                    key={`${file.changeType}:${file.relativePath}`}
                    className="font-mono text-xs leading-6 text-slate-700"
                  >
                    {file.changeType.padEnd(10)} {file.relativePath}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      <Card title="Quality findings">
        {!isFinished ? (
          <Alert
            type="info"
            showIcon
            message="Quality checks are in progress"
            description="This run is not complete yet. The page will update automatically."
          />
        ) : analysis.error !== undefined ? (
          <Alert type="error" message={analysis.error} showIcon />
        ) : (
          <>
            {analysis.aiStatus === "not_configured" && (
              <Alert
                className="mb-4"
                type="info"
                showIcon
                message="AI is not configured on this server."
                description="Deterministic config checks completed, but no LLM impact report can be generated until the backend AI workflow URL and API key are configured."
              />
            )}
            {analysis.aiStatus === "skipped" && (
              <Alert
                className="mb-4"
                type="info"
                showIcon
                message="AI skipped this run because no eligible changed config or source file was selected."
              />
            )}
            {analysis.aiStatus === "failed" && (
              <Alert
                className="mb-4"
                type="error"
                showIcon
                message="AI workflow request failed."
                description={readAiError(analysis.aiReport)}
              />
            )}
            <Table
              rowKey={(finding, index) =>
                `${finding.code}:${finding.filePath}:${finding.line ?? 0}:${index}`
              }
              pagination={{ pageSize: 8 }}
              dataSource={analysis.findings}
              locale={{
                emptyText:
                  "No deterministic config issue or config value change was found in this pass.",
              }}
              columns={[
                {
                  title: "Severity",
                  dataIndex: "severity",
                  width: 100,
                  render: (severity: string) => (
                    <SeverityTag severity={severity} />
                  ),
                },
                { title: "Rule", dataIndex: "code", width: 210 },
                { title: "Finding", dataIndex: "message" },
                {
                  title: "Evidence",
                  render: (_, finding) =>
                    `${finding.filePath}${finding.line === undefined ? "" : `:${finding.line}`}`,
                },
              ]}
            />
          </>
        )}
      </Card>

      {analysis.aiReport !== undefined && (
        <Card title="AI impact report">
          <AiReport report={analysis.aiReport} />
        </Card>
      )}
    </>
  );
}

function SeverityTag({ severity }: { severity: string }) {
  const color =
    severity === "error" ? "red" : severity === "warning" ? "orange" : "blue";
  return <Tag color={color}>{severity.toUpperCase()}</Tag>;
}

function StatusTag({ status }: { status: AnalysisRun["status"] }) {
  const color =
    status === "completed"
      ? "green"
      : status === "failed"
        ? "red"
        : "processing";
  return <Tag color={color}>{status.toUpperCase()}</Tag>;
}

function AiStatusTag({ status }: { status: AnalysisRun["aiStatus"] }) {
  if (status === undefined) return <Tag>WAITING</Tag>;
  if (status === "not_configured") return <Tag>NOT CONFIGURED</Tag>;
  const color =
    status === "completed" ? "green" : status === "failed" ? "red" : "orange";
  return <Tag color={color}>{status.toUpperCase()}</Tag>;
}

function readAiError(report: Record<string, unknown> | undefined): string {
  return typeof report?.error === "string"
    ? report.error
    : "Inspect the raw structured result and backend log for the workflow error.";
}

function AiReport({ report }: { report: Record<string, unknown> }) {
  const summaryObject = asRecord(report.summary ?? report.tong_quan);
  const summary =
    readStringAny(
      summaryObject,
      "overall_assessment",
      "overview",
      "ket_luan_ngan",
    ) ??
    (typeof report.summary === "string" ? report.summary : undefined) ??
    "The workflow returned a structured report.";
  const verdict =
    typeof report.verdict === "string" ? report.verdict : undefined;
  const riskLevel = readStringAny(
    summaryObject,
    "risk_level",
    "muc_do_rui_ro_chung",
  );
  const confidence = readStringAny(summaryObject, "confidence", "do_tin_cay");
  const changeScope = readStringAny(
    summaryObject,
    "change_scope",
    "pham_vi_thay_doi",
  );
  const compactChangeScope =
    changeScope !== undefined && changeScope.length <= 30;
  const findings = readRecordArray(report.findings ?? report.phat_hien);
  const recommendations = readRecordArray(
    report.recommendations ?? report.de_xuat_uu_tien,
  );
  const inferences = readRecordArray(report.inferences);
  const hypotheses = readRecordArray(report.hypotheses);
  const unknowns = readRecordArray(report.unknowns ?? report.khong_chac_chan);

  return (
    <Space direction="vertical" size="large" className="w-full">
      <div>
        <Space wrap className="mb-3">
          {verdict !== undefined && (
            <Tag color={verdict === "pass" ? "green" : "orange"}>
              {formatLabel(verdict)}
            </Tag>
          )}
          {riskLevel !== undefined && (
            <Tag color={severityColor(riskLevel)}>
              Risk: {formatLabel(riskLevel)}
            </Tag>
          )}
          {confidence !== undefined && (
            <Tag color="blue">Confidence: {formatLabel(confidence)}</Tag>
          )}
          {compactChangeScope && (
            <Tag color={severityColor(changeScope)}>
              Change scope: {formatLabel(changeScope)}
            </Tag>
          )}
        </Space>
        <Typography.Title level={5}>Overall assessment</Typography.Title>
        <Typography.Paragraph className="whitespace-pre-wrap text-base leading-7">
          {summary}
        </Typography.Paragraph>
        {changeScope !== undefined && !compactChangeScope && (
          <Descriptions
            size="small"
            bordered
            column={1}
            items={[
              {
                key: "change-scope",
                label: "Change scope",
                children: changeScope,
              },
            ]}
          />
        )}
      </div>

      {findings.length > 0 && (
        <section className="w-full">
          <Divider orientation="left">Findings ({findings.length})</Divider>
          <Collapse
            items={findings.map((finding, index) => ({
              key: readString(finding, "id") ?? String(index),
              label: <FindingHeader finding={finding} index={index} />,
              children: <FindingDetails finding={finding} />,
            }))}
          />
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="w-full">
          <Divider orientation="left">
            Recommended actions ({recommendations.length})
          </Divider>
          <List
            itemLayout="vertical"
            dataSource={recommendations}
            renderItem={(recommendation, index) => {
              const priority =
                readStringAny(
                  recommendation,
                  "priority",
                  "muc_do_uu_tien",
                ) ?? "normal";
              const dimension = readStringAny(
                recommendation,
                "dimension",
                "khu_vuc",
              );
              return (
                <List.Item>
                  <Space wrap className="mb-2">
                    <Tag>
                      {readString(recommendation, "id") ?? `R${index + 1}`}
                    </Tag>
                    <Tag color={priorityColor(priority)}>
                      {formatLabel(priority)}
                    </Tag>
                    {dimension !== undefined && (
                      <Tag color="blue">{formatLabel(dimension)}</Tag>
                    )}
                  </Space>
                  <Typography.Title level={5} className="!mb-2">
                    {readStringAny(
                      recommendation,
                      "recommendation",
                      "action",
                      "noi_dung",
                    ) ?? "Review this recommendation"}
                  </Typography.Title>
                  {readStringAny(
                    recommendation,
                    "justification",
                    "rationale",
                    "ly_do",
                  ) !== undefined && (
                    <Typography.Paragraph type="secondary">
                      {readStringAny(
                        recommendation,
                        "justification",
                        "rationale",
                        "ly_do",
                      )}
                    </Typography.Paragraph>
                  )}
                  <EvidenceList
                    evidence={recommendation.evidence ?? recommendation.tham_chieu}
                  />
                </List.Item>
              );
            }}
          />
        </section>
      )}

      {(inferences.length > 0 || hypotheses.length > 0) && (
        <section className="w-full">
          <Divider orientation="left">Assumptions to validate</Divider>
          <Collapse
            size="small"
            items={[
              ...inferences.map((item, index) =>
                assumptionCollapseItem(item, `inference-${index}`, "Inference"),
              ),
              ...hypotheses.map((item, index) =>
                assumptionCollapseItem(
                  item,
                  `hypothesis-${index}`,
                  "Hypothesis",
                ),
              ),
            ]}
          />
        </section>
      )}

      {unknowns.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`Unknowns requiring verification (${unknowns.length})`}
          description={
            <List
              size="small"
              dataSource={unknowns}
              renderItem={(unknown) => (
                <List.Item>
                  <div>
                    <Typography.Paragraph className="!mb-2">
                      {readStringAny(unknown, "statement", "mo_ta")}
                    </Typography.Paragraph>
                    <EvidenceList
                      evidence={unknown.evidence ?? unknown.bang_chung}
                    />
                  </div>
                </List.Item>
              )}
            />
          }
        />
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Raw structured result (debug)
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(report, null, 2)}
        </pre>
      </details>
    </Space>
  );
}

function FindingHeader({
  finding,
  index,
}: {
  finding: Record<string, unknown>;
  index: number;
}) {
  const severity = readStringAny(finding, "severity", "muc_do") ?? "info";
  return (
    <Space wrap>
      <Tag>{readString(finding, "id") ?? `F${index + 1}`}</Tag>
      <Tag color={severityColor(severity)}>{formatLabel(severity)}</Tag>
      <Typography.Text strong>
        {readStringAny(finding, "title", "tieu_de") ?? "Untitled finding"}
      </Typography.Text>
    </Space>
  );
}

function FindingDetails({ finding }: { finding: Record<string, unknown> }) {
  const details = [
    { label: "Impact", value: readStringAny(finding, "impact", "tac_dong") },
    {
      label: "Flow safety",
      value: readString(finding, "flow_safety"),
    },
    {
      label: "Recovery risk",
      value: readString(finding, "recovery_risk"),
    },
    { label: "Inference", value: readString(finding, "suy_luan") },
    { label: "Recommendation", value: readString(finding, "de_xuat") },
  ].filter(
    (item): item is { label: string; value: string } =>
      item.value !== undefined,
  );
  const dimension = readStringAny(
    finding,
    "dimension",
    "category",
    "khu_vuc",
  );
  const certainty = readStringAny(
    finding,
    "certainty",
    "confidence",
    "co_so_kho_luu",
  );

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Space wrap>
        {dimension !== undefined && (
          <Tag color="blue">{formatLabel(dimension)}</Tag>
        )}
        {certainty !== undefined && <Tag>{formatLabel(certainty)}</Tag>}
      </Space>
      <Typography.Paragraph className="!mb-0 whitespace-pre-wrap">
        {readStringAny(finding, "description", "mo_ta")}
      </Typography.Paragraph>
      {details.length > 0 && (
        <Descriptions
          size="small"
          bordered
          column={1}
          items={details.map(({ label, value }) => ({
            key: label,
            label,
            children: value,
          }))}
        />
      )}
      <EvidenceList evidence={finding.evidence ?? finding.bang_chung} />
    </Space>
  );
}

function EvidenceList({ evidence }: { evidence: unknown }) {
  const items = readRecordArray(evidence);
  if (items.length === 0) return null;

  return (
    <Space wrap size={[4, 4]}>
      <Typography.Text type="secondary">Evidence:</Typography.Text>
      {items.map((item, index) => {
        const file =
          readStringAny(item, "file", "path", "duong_dan") ??
          "unknown file";
        const suffix = formatEvidenceSuffix(item.lines ?? item.dong);
        return (
          <Tag key={`${file}-${suffix}-${index}`}>
            {file}
            {suffix}
          </Tag>
        );
      })}
    </Space>
  );
}

function assumptionCollapseItem(
  item: Record<string, unknown>,
  key: string,
  kind: string,
) {
  const statement =
    readString(item, "statement") ?? readString(item, "title") ?? kind;
  const certainty = readStringAny(item, "certainty", "confidence");
  return {
    key,
    label: (
      <Space wrap>
        <Tag color={kind === "Hypothesis" ? "orange" : "blue"}>{kind}</Tag>
        {certainty !== undefined && <Tag>{formatLabel(certainty)}</Tag>}
        <span>{statement}</span>
      </Space>
    ),
    children: (
      <Space direction="vertical" className="w-full">
        {readString(item, "rationale") !== undefined && (
          <Typography.Paragraph>
            {readString(item, "rationale")}
          </Typography.Paragraph>
        )}
        <EvidenceList evidence={item.evidence ?? item.basis} />
      </Space>
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .filter(
          (item) =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        )
        .map((item) => item as Record<string, unknown>)
    : [];
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readStringAny(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = readString(record, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function formatEvidenceSuffix(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return `:${value.trim()}`;
  }
  if (!Array.isArray(value)) return "";
  const lines = value.filter(
    (line): line is number => typeof line === "number",
  );
  if (lines.length === 0) return "";
  if (lines.length === 1 || lines[0] === lines[1]) return `:${lines[0]}`;
  return `:${lines[0]}-${lines[1]}`;
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function severityColor(severity: string): string {
  const normalized = severity.toLowerCase();
  if (
    normalized === "critical" ||
    normalized === "high" ||
    normalized === "nghiem_trong" ||
    normalized === "cao"
  ) {
    return "red";
  }
  if (normalized === "medium" || normalized === "trung_binh") {
    return "orange";
  }
  if (normalized === "low" || normalized === "thap") return "blue";
  return "default";
}

function priorityColor(priority: string): string {
  const normalized = priority.toLowerCase();
  if (normalized === "high" || normalized === "p1") return "red";
  if (normalized === "medium" || normalized === "p2") return "orange";
  return "blue";
}
