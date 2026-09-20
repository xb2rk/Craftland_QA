import { Button, Input, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import { useBranches, useCommitSearch } from "../api/hooks.js";

const SPECIAL_REFS = [
  { value: "WORKTREE", label: "Worktree — uncommitted changes" },
  { value: "HEAD", label: "HEAD — latest commit" },
  { value: "HEAD~1", label: "HEAD~1 — one commit back" },
  { value: "HEAD~2", label: "HEAD~2 — two commits back" },
];

interface RefPickerProps {
  localPath: string | undefined;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function RefPicker({ localPath, label, value, onChange }: RefPickerProps): React.JSX.Element {
  const [custom, setCustom] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const branches = useBranches(custom ? undefined : localPath);
  const commits = useCommitSearch(custom ? undefined : localPath, debounced);

  const options = useMemo(() => {
    const branchOptions = (branches.data?.branches ?? []).map((branch) => ({
      value: `branch:${branch.name}`,
      label: `${branch.name} (${branch.shortCommit})${branch.current ? " — current" : ""}`,
      actual: branch.name,
    }));
    const commitOptions = (commits.data?.commits ?? []).map((commit) => ({
      value: `commit:${commit.hash}`,
      label: `${commit.shortHash} · ${commit.date} · ${commit.subject} — ${commit.author}`,
      actual: commit.hash,
    }));
    const specialOptions = SPECIAL_REFS.map((ref) => ({
      value: `special:${ref.value}`,
      label: ref.label,
      actual: ref.value,
    }));
    return [...specialOptions, ...branchOptions, ...commitOptions];
  }, [branches.data, commits.data]);

  const selectedOption = options.find((option) => option.actual === value);

  return (
    <div>
      <Typography.Text strong>{label}</Typography.Text>
      {custom ? (
        <Space.Compact style={{ display: "flex", marginTop: 4 }}>
          <Input
            placeholder="Type any ref: branch, tag, hash, HEAD~3…"
            defaultValue={value}
            onPressEnter={(event) =>
              onChange((event.target as HTMLInputElement).value.trim())
            }
          />
          <Button
            onClick={() => {
              const input = document.querySelector(
                `input[placeholder^="Type any ref"]`,
              ) as HTMLInputElement | null;
              if (input && input.value.trim().length > 0) onChange(input.value.trim());
              setCustom(false);
            }}
          >
            Apply
          </Button>
          <Button type="link" onClick={() => setCustom(false)}>
            Back to search
          </Button>
        </Space.Compact>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Select
            showSearch
            style={{ flex: 1 }}
            placeholder="Search branches or commits…"
            value={selectedOption?.value}
            onChange={(optionValue: string) => {
              const option = options.find((candidate) => candidate.value === optionValue);
              if (option) onChange(option.actual);
            }}
            onSearch={setSearch}
            filterOption={(input, option) =>
              (option?.label as string | undefined)?.toLowerCase().includes(input.toLowerCase()) ??
              false
            }
            options={options}
            loading={branches.isLoading || commits.isFetching}
            disabled={localPath === undefined || localPath.length === 0}
          />
          <Button type="link" onClick={() => setCustom(true)}>
            Custom
          </Button>
        </div>
      )}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Current: <Typography.Text code>{value}</Typography.Text>
      </Typography.Text>
    </div>
  );
}
