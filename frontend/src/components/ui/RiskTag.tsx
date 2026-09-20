import { Tag } from "antd";

import { riskColor } from "../system-map.js";

export function RiskTag({ risk }: { risk: string }): React.JSX.Element {
  return (
    <Tag color={riskColor(risk)} className="cqa-risk">
      {risk}
    </Tag>
  );
}
