import { Alert, Button, Drawer, Input, List, Skeleton, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { useAskQuestionMutation, useQuestions } from "../api/hooks.js";
import { ApiError } from "../api/types.js";

const STARTERS = [
  "What must I verify before merging this?",
  "Explain the riskiest change in designer terms.",
  "Which files need a second look and why?",
];

interface QuestionDrawerProps {
  runId: string;
  open: boolean;
  aiConfigured: boolean;
  onClose: () => void;
  initialQuestion?: string;
}

export function QuestionDrawer({
  runId,
  open,
  aiConfigured,
  onClose,
  initialQuestion,
}: QuestionDrawerProps): React.JSX.Element {
  const questions = useQuestions(open ? runId : undefined);
  const ask = useAskQuestionMutation(open ? runId : undefined);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft(initialQuestion ?? "");
  }, [open, initialQuestion]);

  const submit = (question: string): void => {
    const trimmed = question.trim();
    if (trimmed.length === 0 || ask.isPending) return;
    ask.mutate(trimmed, { onSuccess: () => setDraft("") });
  };

  return (
    <Drawer
      title="Ask about this change"
      open={open}
      onClose={onClose}
      width={440}
      destroyOnClose
    >
      {!aiConfigured && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="AI is off — answers need a configured workflow."
        />
      )}
      <Typography.Text type="secondary">Suggested starters</Typography.Text>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        {STARTERS.map((starter) => (
          <Tag
            key={starter}
            style={{ cursor: "pointer", padding: "4px 10px" }}
            onClick={() => submit(starter)}
          >
            {starter}
          </Tag>
        ))}
      </div>
      {questions.isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <List
          dataSource={questions.data ?? []}
          locale={{ emptyText: "No questions yet — ask the first one below." }}
          renderItem={(exchange) => (
            <List.Item>
              <div>
                <Typography.Text strong>Q: {exchange.question}</Typography.Text>
                <Typography.Paragraph style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                  {exchange.answer}
                </Typography.Paragraph>
                {exchange.citations.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {exchange.citations.map((citation) => (
                      <Tag key={citation}>{citation}</Tag>
                    ))}
                  </div>
                )}
              </div>
            </List.Item>
          )}
        />
      )}
      {ask.error instanceof ApiError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={`${ask.error.code}: ${ask.error.message}`}
        />
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={() => submit(draft)}
          placeholder="Ask about this run…"
        />
        <Button
          type="primary"
          loading={ask.isPending}
          disabled={draft.trim().length === 0}
          onClick={() => submit(draft)}
        >
          Ask
        </Button>
      </div>
    </Drawer>
  );
}
