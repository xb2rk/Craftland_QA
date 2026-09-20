import { Select, Typography } from "antd";

import { ANALYSIS_LENSES, type AnalysisLens } from "../api/types.js";

interface LensPickerProps {
  value: AnalysisLens;
  onChange: (value: AnalysisLens) => void;
}

export function LensPicker({ value, onChange }: LensPickerProps): React.JSX.Element {
  const selected = ANALYSIS_LENSES.find((lens) => lens.value === value);
  return (
    <div style={{ marginTop: 12 }}>
      <Typography.Text strong>Review lens</Typography.Text>
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <Select
          value={value}
          onChange={onChange}
          style={{ minWidth: 240 }}
          options={ANALYSIS_LENSES.map((lens) => ({
            value: lens.value,
            label: lens.label,
          }))}
        />
        {selected && (
          <Typography.Text type="secondary" style={{ alignSelf: "center" }}>
            {selected.hint}
          </Typography.Text>
        )}
      </div>
    </div>
  );
}
