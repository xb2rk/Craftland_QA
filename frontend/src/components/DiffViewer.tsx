import { Alert, App, Button, Card, Input, Segmented, Space, Tag, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";

import type { ChangedFileRef } from "../api/types.js";
import {
  parseUnifiedDiff,
  splitHunkRows,
  type DiffFile,
  type DiffLine,
  type SplitCell,
} from "./diff-parse.js";

interface DiffViewerProps {
  diff?: string;
  truncated?: boolean;
  files?: ChangedFileRef[];
}

function statusColor(status: DiffFile["status"]): string {
  switch (status) {
    case "added":
      return "green";
    case "deleted":
      return "red";
    case "renamed":
      return "orange";
    default:
      return "blue";
  }
}

function unifiedRowClass(line: DiffLine): string | undefined {
  if (line.type === "add") return "diff-add";
  if (line.type === "del") return "diff-del";
  return undefined;
}

function splitCellClass(cell: SplitCell): string | undefined {
  if (cell.type === "add") return "cqa-diff-add";
  if (cell.type === "del") return "cqa-diff-del";
  if (cell.type === "empty") return "cqa-diff-empty";
  return undefined;
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function scrollToFile(index: number): void {
  document
    .getElementById(`diff-file-${index}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function DiffViewer({ diff, truncated, files }: DiffViewerProps): React.JSX.Element {
  const { message } = App.useApp();
  const [view, setView] = useState<"unified" | "split">("unified");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const parsed = useMemo(() => (diff ? parseUnifiedDiff(diff) : []), [diff]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return parsed;
    return parsed.filter((file) => file.path.toLowerCase().includes(needle));
  }, [parsed, query]);

  if (diff === undefined || diff.trim().length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="No stored diff for this run — the file list still shows what changed."
      />
    );
  }

  const copyText = (value: string, label: string): void => {
    try {
      const result = navigator.clipboard?.writeText(value);
      if (result) {
        void result.then(
          () => message.success(`${label} copied.`),
          () => message.error(`Could not copy the ${label.toLowerCase()}.`),
        );
      }
    } catch {
      message.error(`Could not copy the ${label.toLowerCase()}.`);
    }
  };

  const setAll = (value: boolean): void => {
    const next: Record<number, boolean> = {};
    parsed.forEach((_, index) => {
      next[index] = value;
    });
    setCollapsed(next);
  };

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
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          value={view}
          onChange={(next) => setView(next as "unified" | "split")}
          options={[
            { value: "unified", label: "Unified" },
            { value: "split", label: "Split" },
          ]}
        />
        <Input.Search
          allowClear
          placeholder="Filter files by path…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: 240 }}
        />
        <Button size="small" onClick={() => setAll(false)}>
          Expand all
        </Button>
        <Button size="small" onClick={() => setAll(true)}>
          Collapse all
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {visible.length} of {parsed.length} files
          {files !== undefined && files.length !== parsed.length
            ? ` · ${files.length} changed in total`
            : ""}
        </Typography.Text>
      </Space>

      {visible.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {visible.map((file) => {
            const index = parsed.indexOf(file);
            return (
              <Button key={`${file.path}-${index}`} size="small" onClick={() => scrollToFile(index)}>
                {baseName(file.path)}
              </Button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.map((file) => {
          const index = parsed.indexOf(file);
          const isCollapsed = collapsed[index] === true;
          return (
            <Card
              key={`${file.path}-${index}`}
              id={`diff-file-${index}`}
              size="small"
              style={{ scrollMarginTop: 76 }}
              title={
                <Tooltip title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>
                  <span style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
                    {baseName(file.path)}{" "}
                    <Tag color={statusColor(file.status)}>{file.status}</Tag>{" "}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      +{file.added} −{file.deleted}
                    </Typography.Text>
                  </span>
                </Tooltip>
              }
              extra={
                <Space size={4}>
                  <Button size="small" type="link" onClick={() => copyText(file.path, "Path")}>
                    Copy path
                  </Button>
                  <Button size="small" type="link" onClick={() => copyText(file.raw, "File diff")}>
                    Copy diff
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => setCollapsed({ ...collapsed, [index]: !isCollapsed })}
                  >
                    {isCollapsed ? "Expand" : "Collapse"}
                  </Button>
                </Space>
              }
            >
              {isCollapsed ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {file.hunks.length} hunk{file.hunks.length === 1 ? "" : "s"} hidden.
                </Typography.Text>
              ) : (
                <div className="dark-panel" style={{ overflowX: "auto" }}>
                  {view === "unified" ? (
                    <table className="cqa-diff-table">
                      <tbody>
                        {file.hunks.map((hunk, hunkIndex) => (
                          <>
                            <tr key={`h-${hunkIndex}`} className="cqa-diff-hunk">
                              <td colSpan={3}>{hunk.header}</td>
                            </tr>
                            {hunk.lines.map((line, lineIndex) =>
                              line.type === "note" ? (
                                <tr key={`n-${lineIndex}`}>
                                  <td colSpan={3} className="cqa-diff-text">
                                    {line.text}
                                  </td>
                                </tr>
                              ) : (
                                <tr key={lineIndex} className={unifiedRowClass(line)}>
                                  <td className="cqa-diff-gutter">{line.oldNo ?? ""}</td>
                                  <td className="cqa-diff-gutter">{line.newNo ?? ""}</td>
                                  <td className="cqa-diff-text">
                                    {line.text.length === 0 ? " " : line.text}
                                  </td>
                                </tr>
                              ),
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="cqa-diff-table">
                      <tbody>
                        {file.hunks.map((hunk, hunkIndex) => (
                          <>
                            <tr key={`h-${hunkIndex}`} className="cqa-diff-hunk">
                              <td colSpan={4}>{hunk.header}</td>
                            </tr>
                            {splitHunkRows(hunk).map((row, rowIndex) =>
                              row.old.type === "note" ? (
                                <tr key={`n-${rowIndex}`}>
                                  <td colSpan={4} className="cqa-diff-text">
                                    {row.old.text}
                                  </td>
                                </tr>
                              ) : (
                                <tr key={rowIndex}>
                                  <td className="cqa-diff-gutter">{row.old.no ?? ""}</td>
                                  <td className={`cqa-diff-text ${splitCellClass(row.old) ?? ""}`}>
                                    {row.old.text.length === 0 ? " " : row.old.text}
                                  </td>
                                  <td className="cqa-diff-gutter">{row.new.no ?? ""}</td>
                                  <td className={`cqa-diff-text ${splitCellClass(row.new) ?? ""}`}>
                                    {row.new.text.length === 0 ? " " : row.new.text}
                                  </td>
                                </tr>
                              ),
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {visible.length === 0 && (
        <Alert type="info" showIcon message="No files match this filter." style={{ marginTop: 8 }} />
      )}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Per-file view of the compared revision. Line counts follow the stored snapshot, not the
        live worktree.
      </Typography.Text>
    </div>
  );
}
