import { Alert, Button, Input, Skeleton, Tag, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import { useInspectQuery, useWhatIfMutation } from "../api/hooks.js";
import { ApiError } from "../api/types.js";
import { AiReport } from "./AiReport.js";
import { SystemFindings } from "./SystemFindings.js";
import { SectionCard } from "./ui/SectionCard.js";
import { draftEditFromPrompt } from "../whatif/prompt-draft.js";
import {
  loadThreads,
  newThreadId,
  saveThreads,
  type WhatIfMessage,
} from "../whatif/threads.js";

const EXAMPLES = [
  "What if Slime Boss HP was 300 for a better player experience?",
  "What if sword price goes from 100 to 150 in ShopData?",
  "Is doubling zombie HP on Night 3 safe for new players?",
];

function hasExactEdit(result: {
  filePath: string;
  keyColumn: string;
  keyValue: string;
  column: string;
}): boolean {
  return (
    result.filePath.trim().length > 0 &&
    result.keyValue.trim().length > 0 &&
    result.column.trim().length > 0
  );
}

export function WhatIfThread({
  projectId,
  projectName,
  localPath,
  baseRef,
}: {
  projectId: string;
  projectName: string;
  localPath: string;
  baseRef: string;
}): React.JSX.Element {
  const inspection = useInspectQuery(localPath);
  const whatIf = useWhatIfMutation();
  const [threads, setThreads] = useState<WhatIfMessage[]>(() => loadThreads());
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const csvFiles = useMemo(
    () =>
      (inspection.data?.files ?? [])
        .filter((file) => file.relativePath.toLowerCase().endsWith(".csv"))
        .map((file) => file.relativePath)
        .sort(),
    [inspection.data],
  );
  const messages = useMemo(
    () => threads.filter((entry) => entry.projectId === projectId),
    [threads, projectId],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, whatIf.isPending]);

  const persist = (next: WhatIfMessage[]): void => {
    setThreads(next);
    saveThreads(next);
  };

  const ask = (): void => {
    const question = draft.trim();
    if (question.length === 0 || whatIf.isPending) return;
    // Parser hints only — the backend resolves the real file/row itself.
    const parsed = draftEditFromPrompt(question, csvFiles);
    const history = messages
      .filter((entry) => entry.result?.answer)
      .slice(-6)
      .map((entry) => ({
        question: entry.question,
        answer: entry.result!.answer as string,
      }));
    const message: WhatIfMessage = {
      id: newThreadId(),
      projectId,
      baseRef,
      question,
      filePath: parsed.filePath,
      keyColumn: parsed.keyColumn,
      keyValue: parsed.keyValue,
      column: parsed.column,
      newValue: parsed.newValue,
      notes: parsed.notes,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const next = [...threads, message];
    persist(next);
    setDraft("");
    whatIf.mutate(
      {
        localPath,
        baseRef,
        question,
        history: history.length > 0 ? history : undefined,
        filePath: parsed.filePath,
        keyColumn: parsed.keyColumn,
        keyValue: parsed.keyValue,
        column: parsed.column,
        newValue: parsed.newValue,
        goal: question,
      },
      {
        onSuccess: (result) =>
          persist(
            next.map((entry) =>
              entry.id === message.id ? { ...entry, status: "answered", result } : entry,
            ),
          ),
        onError: (error) =>
          persist(
            next.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    status: "answered",
                    error: error instanceof Error ? error.message : "The hypothetical could not run.",
                  }
                : entry,
            ),
          ),
      },
    );
  };

  return (
    <SectionCard
      title="Hypothetical tuning"
      description={`Reads files from ${baseRef} in ${projectName} — just ask in plain words. Nothing is written to the repository.`}
      style={{ marginBottom: 0 }}
    >
      <div ref={scrollRef} className="cqa-chat">
        {messages.length === 0 && (
          <Alert
            type="info"
            showIcon
            message="No hypotheticals yet — try one of the examples below."
          />
        )}
        {messages.map((message) => (
          <div key={message.id} className="cqa-chat-turn">
            <div className="cqa-bubble-user">{message.question}</div>
            {message.status === "needs-detail" ? (
              <Alert
                type="warning"
                showIcon
                message="This question was asked with an older parser — ask it again and it will run."
                description={
                  <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                    {message.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                }
              />
            ) : message.status === "pending" && !message.result && !message.error ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : message.error ? (
              <Alert type="error" showIcon message={message.error} />
            ) : message.result ? (
              <div className="cqa-answer">
                {message.result.answer && (
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>
                    {message.result.answer}
                  </Typography.Paragraph>
                )}
                {message.result.citations && message.result.citations.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {message.result.citations.map((citation) => (
                      <Tag key={citation}>{citation}</Tag>
                    ))}
                  </div>
                )}
                {hasExactEdit(message.result) ? (
                  <>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Read as: {message.result.filePath}
                      {message.result.keyColumn && message.result.keyValue
                        ? ` · ${message.result.keyColumn}=${message.result.keyValue}`
                        : ""}
                      {message.result.column ? (
                        <>
                          {" "}· {message.result.column}:{" "}
                          <Typography.Text delete style={{ fontSize: 12 }}>
                            {message.result.oldValue}
                          </Typography.Text>{" "}
                          → {message.result.newValue}
                        </>
                      ) : null}
                    </Typography.Text>
                    <div style={{ margin: "8px 0" }}>
                      <Tag>AI: {message.result.aiStatus.replace(/_/g, " ")}</Tag>
                    </div>
                    {message.result.findings.length > 0 && (
                      <SystemFindings findings={message.result.findings} />
                    )}
                  </>
                ) : (
                  message.result.findings.length > 0 && (
                    <SystemFindings findings={message.result.findings} />
                  )
                )}
                {!message.result.answer &&
                  message.result.findings.length === 0 &&
                  message.result.aiStatus === "not_configured" && (
                    <Alert
                      type="warning"
                      showIcon
                      message={
                        message.result.error ??
                        "AI is not configured — exact single-cell edits still work."
                      }
                    />
                  )}
                {message.result.aiReport !== undefined && message.result.aiReport !== null && (
                  <div style={{ marginTop: 12 }}>
                    <AiReport report={message.result.aiReport} />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {EXAMPLES.map((example) => (
          <Tag
            key={example}
            style={{ cursor: "pointer", padding: "4px 10px" }}
            onClick={() => setDraft(example)}
          >
            {example}
          </Tag>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Input.TextArea
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
          placeholder="Ask a what-if question… (Enter to send, Shift+Enter for a new line)"
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          size="large"
          disabled={draft.trim().length === 0}
          loading={whatIf.isPending}
          onClick={ask}
        >
          Ask
        </Button>
      </div>
      {whatIf.error instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 8 }}
          message={`${whatIf.error.code}: ${whatIf.error.message}`}
        />
      )}
      {messages.length > 0 && (
        <Button
          type="link"
          size="small"
          danger
          style={{ marginTop: 4 }}
          onClick={() => persist(threads.filter((entry) => entry.projectId !== projectId))}
        >
          Clear this thread
        </Button>
      )}
    </SectionCard>
  );
}
