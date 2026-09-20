import { Typography } from "antd";
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  sub,
  icon,
  dim = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  dim?: boolean;
}): React.JSX.Element {
  return (
    <div className={`cqa-stat${dim ? " cqa-stat-dim" : ""}`}>
      {icon ? <div className="cqa-stat-icon">{icon}</div> : null}
      <div className="cqa-stat-value">{value}</div>
      <div className="cqa-stat-label">{label}</div>
      {sub ? (
        <Typography.Text type="secondary" className="cqa-stat-sub">
          {sub}
        </Typography.Text>
      ) : null}
    </div>
  );
}
