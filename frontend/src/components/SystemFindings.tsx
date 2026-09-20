import { Button, Collapse, Empty, Tag, Typography } from "antd";

import type { Finding } from "../api/types.js";
import { groupFindingsBySystem, humanizeFindingCode, severityColor } from "./system-map.js";

export function SystemFindings({
  findings,
  onAsk,
}: {
  findings: Finding[];
  onAsk?: (question: string) => void;
}): React.JSX.Element {
  if (findings.length === 0) {
    return <Empty description="No issues found — the change looks clean." />;
  }
  const groups = groupFindingsBySystem(findings);
  return (
    <Collapse
      defaultActiveKey={groups.map((group) => group.system)}
      items={groups.map((group) => ({
        key: group.system,
        label: (
          <span>
            <strong>{group.system}</strong>{" "}
            <Tag color={group.findings.some((finding) => finding.severity === "error") ? "red" : "default"}>
              {group.findings.length}
            </Tag>
          </span>
        ),
        children: (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {group.findings.map((finding, index) => (
              <li
                key={`${finding.code}-${finding.filePath}-${finding.line ?? 0}-${index}`}
                style={{ marginBottom: 8 }}
              >
                <Tag color={severityColor(finding.severity)}>{finding.severity}</Tag>{" "}
                <strong>{humanizeFindingCode(finding.code)}</strong> — {finding.message}
                <br />
                <Typography.Text code style={{ fontSize: 12 }}>
                  {finding.filePath}
                  {finding.line !== undefined ? `:${finding.line}` : ""}
                </Typography.Text>
                {onAsk && (
                  <>
                    {" "}
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        onAsk(
                          `Explain "${humanizeFindingCode(finding.code)}" in ${finding.filePath}: ${finding.message} — is it safe?`,
                        )
                      }
                    >
                      Ask
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ),
      }))}
    />
  );
}
