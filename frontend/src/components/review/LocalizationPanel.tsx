import { Alert, Button, Collapse, Input, Segmented, Skeleton, Table, Tag, Typography } from "antd";
import { useState } from "react";

import { useLocalizationAskMutation, useLocalizationMutation } from "../../api/hooks.js";
import { useInspectQuery } from "../../api/hooks.js";
import { ApiError, type LocalizationMode } from "../../api/types.js";
import { AiReport } from "../AiReport.js";
import { SystemFindings } from "../SystemFindings.js";
import { downloadTextFile } from "../run-io.js";
import { SectionCard } from "../ui/SectionCard.js";

const MODE_HINTS: Record<LocalizationMode, string> = {
  check: "Finds missing cells, duplicate keys, and broken rows — deterministic first, AI summary when available.",
  translate: "Fills empty cells with AI translations and offers the result as a CSV download. Nothing is written back.",
};

/**
 * LocalizationPanel runs key.csv-style QA for one revision. The table is
 * auto-detected (Craftland convention: key.csv) so designers never type a
 * path; an override exists for unusual repos. Check mode runs deterministic
 * integrity checks plus an AI narrative; translate mode previews AI-filled
 * cells scoped to a language or key, downloadable as CSV.
 */
export function LocalizationPanel(props: {
  localPath: string;
  baseRef: string;
  glossary: string;
  onGlossaryChange: (value: string) => void;
}): React.JSX.Element {
  const [override, setOverride] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [mode, setMode] = useState<LocalizationMode>("check");
  const [language, setLanguage] = useState("");
  const [key, setKey] = useState("");
  const [goal, setGoal] = useState("");
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const localization = useLocalizationMutation();
  const ask = useLocalizationAskMutation();
  const inspection = useInspectQuery(props.localPath);

  const detected =
    inspection.data?.files
      .map((file) => file.relativePath)
      .find((name) => name.toLowerCase().replace(/\\/g, "/").endsWith("key.csv")) ?? null;
  const effectiveFile =
    override.trim().length > 0 ? override.trim() : (detected ?? undefined);

  const trimmed = (value: string): string | undefined =>
    value.trim().length > 0 ? value.trim() : undefined;

  const run = (): void => {
    localization.mutate({
      localPath: props.localPath,
      baseRef: props.baseRef,
      filePath: effectiveFile,
      mode,
      language: trimmed(language),
      key: trimmed(key),
      goal: trimmed(goal),
      glossary: trimmed(props.glossary),
    });
  };

  const askTarget = localization.data?.filePath ?? effectiveFile;
  const sendQuestion = (): void => {
    const asked = question.trim();
    if (asked.length === 0 || askTarget === undefined) return;
    ask.mutate(
      {
        localPath: props.localPath,
        baseRef: props.baseRef,
        filePath: askTarget,
        question: asked,
        history,
        glossary: trimmed(props.glossary),
      },
      {
        onSuccess: (answer) => {
          setHistory((current) => [
            ...current,
            { question: asked, answer: answer.answer },
          ]);
          setQuestion("");
        },
      },
    );
  };

  const download = (): void => {
    if (!localization.data?.translatedCsv) return;
    const name = (localization.data.filePath ?? "key.csv").split(/[/\\]/).pop() ?? "key.csv";
    downloadTextFile(`translated-${name}`, localization.data.translatedCsv, "text/csv");
  };

  return (
    <div>
      <SectionCard
        title="Localization QA"
        description="One table, one revision. The table is found for you — just pick what to do."
        extra={
          detected ? (
            <Tag color="green">key.csv auto-detected</Tag>
          ) : (
            <Tag color="orange">no key.csv found</Tag>
          )
        }
      >
        <Typography.Text type="secondary">
          Table:{" "}
          <Typography.Text code>
            {effectiveFile ?? "key.csv (backend default)"}
          </Typography.Text>
        </Typography.Text>
        {!showOverride ? (
          <Button
            type="link"
            size="small"
            onClick={() => setShowOverride(true)}
            style={{ paddingLeft: 8 }}
          >
            Use a different file
          </Button>
        ) : (
          <div style={{ marginTop: 8, maxWidth: 360 }}>
            <Input
              placeholder="e.g. Assets/Localization/strings.csv"
              value={override}
              onChange={(event) => setOverride(event.target.value)}
            />
          </div>
        )}

        <Typography.Text strong style={{ display: "block", marginTop: 16 }}>
          What should I do?
        </Typography.Text>
        <div style={{ marginTop: 8 }}>
          <Segmented<LocalizationMode>
            className="cqa-mode-seg"
            options={[
              { value: "check", label: "Check" },
              { value: "translate", label: "Translate" },
            ]}
            value={mode}
            onChange={(value) => setMode(value)}
          />
        </div>
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
          {MODE_HINTS[mode]}
        </Typography.Text>

        <Typography.Text strong style={{ display: "block", marginTop: 16 }}>
          Which language?
        </Typography.Text>
        {localization.data && localization.data.languages.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {localization.data.languages.map((code) => (
              <Tag
                key={code}
                color={language.trim() === code ? "blue" : "default"}
                onClick={() => setLanguage(code)}
                style={{ cursor: "pointer" }}
              >
                {code}
              </Tag>
            ))}
          </div>
        )}
        <Input
          placeholder="Language code, e.g. vi (leave empty for all languages)"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          style={{ marginTop: 8, maxWidth: 360 }}
        />

        <Typography.Text strong style={{ display: "block", marginTop: 16 }}>
          Limit to one key? <Typography.Text type="secondary">(optional)</Typography.Text>
        </Typography.Text>
        <Input
          placeholder="e.g. GAME_NAME"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          style={{ marginTop: 8, maxWidth: 360 }}
        />

        <Typography.Text strong style={{ display: "block", marginTop: 16 }}>
          Anything to focus on? <Typography.Text type="secondary">(optional)</Typography.Text>
        </Typography.Text>
        <Input
          placeholder="e.g. only the new mission keys"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          style={{ marginTop: 8 }}
        />

        <Collapse
          ghost
          style={{ marginTop: 8 }}
          items={[
            {
              key: "glossary",
              label: "Game-term glossary for the AI (saved per project, optional)",
              children: (
                <Input.TextArea
                  placeholder="e.g. Garden Invaders stays untranslated"
                  value={props.glossary}
                  onChange={(event) => props.onGlossaryChange(event.target.value)}
                  rows={2}
                />
              ),
            },
          ]}
        />

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button type="primary" loading={localization.isPending} onClick={run}>
            {mode === "check" ? "Check localization" : "Preview translations"}
          </Button>
          {localization.data && (
            <Tag color={localization.data.findings.length > 0 ? "red" : "green"}>
              {localization.data.filesChecked.length} files ·{" "}
              {localization.data.findings.length} issues
              {localization.data.translations.length > 0 &&
                ` · ${localization.data.translations.length} proposed`}
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
          {localization.data.translations.length > 0 && (
            <SectionCard
              title="Proposed translations"
              description="Review each cell, then download the translated CSV. Nothing is applied automatically."
              style={{ marginTop: 12 }}
              extra={
                localization.data.translatedCsv ? (
                  <Button size="small" onClick={download}>
                    Download CSV
                  </Button>
                ) : undefined
              }
            >
              <Table
                size="small"
                rowKey={(row) => `${row.key}::${row.language}`}
                dataSource={localization.data.translations}
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: "Key", dataIndex: "key", key: "key" },
                  { title: "Language", dataIndex: "language", key: "language", width: 110 },
                  {
                    title: "Old value",
                    dataIndex: "oldValue",
                    key: "oldValue",
                    render: (value: string) => value === "" ? <em>(empty)</em> : value,
                  },
                  { title: "New value", dataIndex: "newValue", key: "newValue" },
                ]}
              />
            </SectionCard>
          )}
          {localization.data.aiReport !== undefined &&
            localization.data.aiReport !== null && (
              <div style={{ marginTop: 12 }}>
                <AiReport report={localization.data.aiReport} />
              </div>
            )}
          <SectionCard
            title="Ask about this table"
            description="Follow-up questions answered from the checked file, with your glossary applied."
            style={{ marginTop: 12 }}
          >
            {history.map((entry, index) => (
              <div key={index} style={{ marginBottom: 12 }}>
                <Typography.Text strong>Q: {entry.question}</Typography.Text>
                <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                  {entry.answer}
                </Typography.Paragraph>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                placeholder="e.g. Is this translation too formal for a kids game?"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onPressEnter={sendQuestion}
              />
              <Button
                loading={ask.isPending}
                onClick={sendQuestion}
                disabled={askTarget === undefined}
                title={askTarget === undefined ? "Run a check first so I know which table to read." : undefined}
              >
                Ask
              </Button>
            </div>
            {ask.error instanceof ApiError && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 12 }}
                message={`${ask.error.code}: ${ask.error.message}`}
              />
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
