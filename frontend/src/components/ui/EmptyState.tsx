import { Empty, Typography } from "antd";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="cqa-empty">
      <Empty
        description={
          <span>
            <strong>{title}</strong>
            {description ? (
              <>
                <br />
                <Typography.Text type="secondary">{description}</Typography.Text>
              </>
            ) : null}
          </span>
        }
      />
      {action ? <div className="cqa-empty-action">{action}</div> : null}
    </div>
  );
}
