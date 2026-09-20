import { FolderOutlined } from "@ant-design/icons";
import { Alert, Breadcrumb, Button, Input, List, Modal, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { useBrowse } from "../api/hooks.js";
import { ApiError } from "../api/types.js";

interface FolderBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function FolderBrowser({ open, onClose, onSelect }: FolderBrowserProps): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [typedPath, setTypedPath] = useState("");
  const browse = useBrowse(open ? currentPath : undefined);

  useEffect(() => {
    if (open) {
      setCurrentPath(null);
      setTypedPath("");
      void browse.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const rootsNotConfigured =
    browse.error instanceof ApiError && browse.error.code === "BROWSE_ROOTS_NOT_CONFIGURED";

  const trimmedTyped = typedPath.trim();
  const effectivePath = trimmedTyped.length > 0 ? trimmedTyped : currentPath;

  const segments =
    currentPath !== null && currentPath.length > 0
      ? currentPath.split(/[/\\]/).filter((segment) => segment.length > 0)
      : [];

  return (
    <Modal
      title="Choose a project folder"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="select"
          type="primary"
          disabled={effectivePath === null || effectivePath.length === 0}
          onClick={() => {
            if (effectivePath !== null && effectivePath.length > 0) onSelect(effectivePath);
          }}
        >
          Use this path
        </Button>,
      ]}
      width={640}
    >
      <Input
        placeholder="Or paste a server-local path, e.g. C:\repos\my-game"
        value={typedPath}
        onChange={(event) => setTypedPath(event.target.value)}
        onPressEnter={() => {
          if (trimmedTyped.length > 0) onSelect(trimmedTyped);
        }}
        style={{ marginBottom: 12 }}
      />
      {rootsNotConfigured ? (
        <Alert
          type="info"
          showIcon
          message="Server folder browsing is off — paste a path above. Set ANALYZED_ROOTS on the backend to browse here."
        />
      ) : browse.error instanceof Error ? (
        <Alert type="error" showIcon message={browse.error.message} />
      ) : (
        <div>
          <Breadcrumb
            style={{ marginBottom: 8 }}
            items={[
              { title: <a onClick={() => setCurrentPath(null)}>Roots</a> },
              ...segments.map((segment, index) => ({
                title: (
                  <a
                    onClick={() => {
                      const prefix = segments.slice(0, index + 1).join("/");
                      setCurrentPath(prefix);
                    }}
                  >
                    {segment}
                  </a>
                ),
              })),
            ]}
          />
          <List
            loading={browse.isLoading}
            bordered
            dataSource={browse.data?.entries ?? []}
            renderItem={(entry) => (
              <List.Item
                actions={[
                  <Button
                    key="open"
                    type="link"
                    onClick={() => setCurrentPath(entry.path)}
                  >
                    Open
                  </Button>,
                  <Button key="select" type="link" onClick={() => onSelect(entry.path)}>
                    Select
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FolderOutlined />}
                  title={entry.name}
                  description={
                    <span>
                      <Typography.Text code style={{ fontSize: 12 }}>
                        {entry.path}
                      </Typography.Text>{" "}
                      {entry.isRepository && <Tag color="green">git repo</Tag>}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}
    </Modal>
  );
}
