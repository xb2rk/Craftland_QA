import { Typography } from "antd";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="cqa-page-head">
      <div>
        {eyebrow ? <div className="cqa-eyebrow">{eyebrow}</div> : null}
        <Typography.Title level={3} className="cqa-page-title">
          {title}
        </Typography.Title>
        {description ? (
          <Typography.Paragraph type="secondary" className="cqa-page-description">
            {description}
          </Typography.Paragraph>
        ) : null}
      </div>
      {actions ? <div className="cqa-page-actions">{actions}</div> : null}
    </div>
  );
}
