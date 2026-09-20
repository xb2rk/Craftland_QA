import { describe, expect, it } from "vitest";

import {
  groupFindingsBySystem,
  humanizeFindingCode,
} from "../src/components/system-map.js";

describe("groupFindingsBySystem", () => {
  it("groups combat, economy, and progression files separately", () => {
    const groups = groupFindingsBySystem([
      { code: "CONFIG_VALUE_CHANGED", severity: "warning", message: "m", filePath: "ZombieData.csv" },
      { code: "CSV_DUPLICATE_KEY", severity: "error", message: "m", filePath: "ShopData.csv" },
      { code: "CONFIG_RECORD_ADDED", severity: "info", message: "m", filePath: "UpgradeData.csv" },
      { code: "CONFIG_SCHEMA_CHANGED", severity: "warning", message: "m", filePath: "main.cs" },
    ]);
    expect(groups.map((group) => group.system)).toEqual([
      "Combat",
      "Economy",
      "Progression",
      "Other files",
    ]);
    expect(groups[0].findings).toHaveLength(1);
  });
});

describe("humanizeFindingCode", () => {
  it("turns codes into plain language", () => {
    expect(humanizeFindingCode("CONFIG_VALUE_CHANGED")).toBe("Value Changed");
    expect(humanizeFindingCode("CSV_DUPLICATE_KEY")).toBe("Duplicate Key");
  });
});
