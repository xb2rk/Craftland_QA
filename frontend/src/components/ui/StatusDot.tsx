import type { ReactNode } from "react";

import type { StatusTone } from "../../theme/tokens.js";

export function StatusDot({
  color,
  pulse = false,
  label,
  title,
}: {
  color: StatusTone;
  pulse?: boolean;
  label?: ReactNode;
  title?: string;
}): React.JSX.Element {
  return (
    <span className="cqa-status" title={title}>
      <span className={`cqa-dot cqa-dot-${color}${pulse ? " cqa-dot-pulse" : ""}`} />
      {label !== undefined ? <span className="cqa-status-label">{label}</span> : null}
    </span>
  );
}
