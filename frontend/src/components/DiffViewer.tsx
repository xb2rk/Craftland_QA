import { Alert, Typography } from "antd";

interface DiffViewerProps {
  diff?: string;
  truncated?: boolean;
}

function lineClass(line: string): string | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) return "diff-add";
  if (line.startsWith("-") && !line.startsWith("---")) return "diff-del";
  if (line.startsWith("@@")) return "diff-hunk";
  return undefined;
}

export function DiffViewer({ diff, truncated }: DiffViewerProps): React.JSX.Element {
  if (diff === undefined || diff.trim().length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="No stored diff for this run — the file list still shows what changed."
      />
    );
  }
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
      <div className="dark-panel">
        {diff.split("\n").map((line, index) => (
          <div key={index} className={lineClass(line)}>
            {line.length === 0 ? " " : line}
          </div>
        ))}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Unified diff of the compared revision. Line counts follow the stored snapshot, not the
        live worktree.
      </Typography.Text>
    </div>
  );
}
