import { Alert, Typography } from "antd";

import type { ChangedFileRef } from "../api/types.js";

interface DiffViewerProps {
  diff?: string;
  truncated?: boolean;
  files?: ChangedFileRef[];
}

function lineClass(line: string): string | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) return "diff-add";
  if (line.startsWith("-") && !line.startsWith("---")) return "diff-del";
  if (line.startsWith("@@")) return "diff-hunk";
  return undefined;
}

function splitSections(diff: string): string[] {
  return diff.split(/(?=^diff --git )/m).filter((part) => part.trim().length > 0);
}

function scrollToSection(index: number): void {
  document
    .getElementById(`diff-section-${index}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function DiffViewer({ diff, truncated, files }: DiffViewerProps): React.JSX.Element {
  if (diff === undefined || diff.trim().length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="No stored diff for this run — the file list still shows what changed."
      />
    );
  }
  const sections = splitSections(diff);
  const showTree =
    files !== undefined && files.length > 0 && sections.length === files.length;
  return (
    <div>
      {truncated === true && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Diff truncated at the storage limit — earliest files shown first."
        />
      )}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {showTree && (
          <div style={{ width: 230, flexShrink: 0, position: "sticky", top: 76 }}>
            <Typography.Text strong style={{ fontSize: 12 }}>
              Files ({files.length})
            </Typography.Text>
            <div
              style={{
                marginTop: 6,
                maxHeight: 420,
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 4,
                background: "#fff",
              }}
            >
              {files.map((file, index) => (
                <div
                  key={`${file.relativePath}-${index}`}
                  onClick={() => scrollToSection(index)}
                  style={{
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={file.relativePath}
                >
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {file.relativePath.split("/").slice(-1)[0]}
                  </Typography.Text>{" "}
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {file.changeType}
                  </Typography.Text>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="dark-panel" style={{ flex: 1, minWidth: 0 }}>
          {sections.map((section, index) => (
            <div
              key={index}
              id={`diff-section-${index}`}
              style={{ scrollMarginTop: 76 }}
            >
              {section.split("\n").map((line, lineIndex) => (
                <div key={lineIndex} className={lineClass(line)}>
                  {line.length === 0 ? " " : line}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Unified diff of the compared revision. Line counts follow the stored snapshot, not the
        live worktree.
      </Typography.Text>
    </div>
  );
}
