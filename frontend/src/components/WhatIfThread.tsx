import { Alert, Button, Input, Skeleton, Tag, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import { useInspectQuery, useWhatIfMutation } from "../api/hooks.js";
import { ApiError } from "../api/types.js";
import { AiReport } from "./AiReport.js";
import { SystemFindings } from "./SystemFindings.js";
import { draftEditFromPrompt } from "../whatif/prompt-draft.js";
import {
  loadThreads,
  newThreadId,
  saveThreads,
  type WhatIfMessage,
} from "../whatif/threads.js";

const EXAMPLES = [
  "What if sword price goes from 100 to 150 in ShopData?",
  "Set drop rate to 0.05 for the gold chest",
  "Bump Night 3 zombie HP by 50 for id 12",
];

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

  const updateMessage = (id: string, patch: Partial<WhatIfMessage>): void => {
    persist(threads.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const ask = (): void => {
    const question = draft.trim();
    if (question.length === 0 || whatIf.isPending) return;
    const parsed = draftEditFromPrompt(question, csvFiles);
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
      status:
        parsed.filePath && parsed.keyValue && parsed.column && parsed.newValue
          ? "pending"
          : "needs-detail",
      createdAt: new Date().toISOString(),
    };
    persist([...threads, message]);
    setDraft("");
    if (message.status === "needs-detail") return;
    whatIf.mutate(
      {
        localPath,
        baseRef,
        filePath: message.filePath!,
        keyColumn: message.keyColumn,
        keyValue: message.keyValue!,
        column: message.column!,
        newValue: message.newValue!,
        goal: question,
      },
      {
        onSuccess: (result) => updateMessage(message.id, { status: "answered", result }),
        onError: (error) =>
          updateMessage(message.id, {
            status: "answered",
            error: error instanceof Error ? error.message : "The hypothetical could not run.",
          }),
      },
    );
  };

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Reads files from <Typography.Text code>{baseRef}</Typography.Text> in {projectName} —
        just ask. Nothing is written to the repository.
      </Typography.Paragraph>

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
                message="Almost — one detail is missing."
                description={
                  <div>
                    <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                      {message.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                    <Typography.Text type="secondary">
                      Reply with the missing detail — e.g. the file and row name.
                    </Typography.Text>
                  </div>
                }
              />
            ) : message.status === "pending" && !message.result && !message.error ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : message.error ? (
              <Alert type="error" showIcon message={message.error} />
            ) : message.result ? (
              <div className="cqa-answer">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Read as: {message.result.filePath} · {message.result.keyColumn}=
                  {message.result.keyValue} · {message.result.column}:{" "}
                  <Typography.Text delete style={{ fontSize: 12 }}>
                    {message.result.oldValue}
                  </Typography.Text>{" "}
                  → {message.result.newValue}
                </Typography.Text>
                <div style={{ margin: "8px 0" }}>
                  <Tag>AI: {message.result.aiStatus.replace(/_/g, " ")}</Tag>
                </div>
                {message.result.findings.length > 0 ? (
                  <SystemFindings findings={message.result.findings} />
                ) : (
                  <Alert
                    type="success"
                    showIcon
                    message="Deterministic checks pass — no structural problems with this edit."
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
    </div>
  );
}
