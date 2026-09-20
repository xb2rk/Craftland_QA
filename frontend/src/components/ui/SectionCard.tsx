import { Card, Typography } from "antd";
import type { CSSProperties, ReactNode } from "react";

import { CQA_SHADOW_CARD } from "../../theme/tokens.js";

export function SectionCard({
  title,
  description,
  extra,
  children,
  style,
  bodyStyle,
}: {
  title?: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}): React.JSX.Element {
  return (
    <Card
      className="cqa-card"
      style={{ marginBottom: 16, boxShadow: CQA_SHADOW_CARD, ...style }}
      styles={{ body: { padding: 20, ...bodyStyle } }}
      title={
        title ? (
          <div>
            <div className="cqa-card-title">{title}</div>
            {description ? (
              <Typography.Text type="secondary" className="cqa-card-description">
                {description}
              </Typography.Text>
            ) : null}
          </div>
        ) : undefined
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}
