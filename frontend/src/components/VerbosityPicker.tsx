import { Select, Typography } from "antd";

import { VERBOSITIES, type Verbosity } from "../api/types.js";

interface VerbosityPickerProps {
  value: Verbosity;
  onChange: (value: Verbosity) => void;
}

export function VerbosityPicker({ value, onChange }: VerbosityPickerProps): React.JSX.Element {
  const selected = VERBOSITIES.find((entry) => entry.value === value);
  return (
    <div style={{ marginTop: 12 }}>
      <Typography.Text strong>Response length</Typography.Text>
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <Select
          value={value}
          onChange={onChange}
          style={{ minWidth: 240 }}
          options={VERBOSITIES.map((entry) => ({
            value: entry.value,
            label: entry.label,
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
