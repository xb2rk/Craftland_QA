import { describe, expect, it } from "vitest";

import {
  compareCsvConfigContent,
  inferKeyColumns,
} from "../src/modules/configs/config-comparator.js";

describe("inferKeyColumns", () => {
  it("prefers an Id column case-insensitively", () => {
    expect(inferKeyColumns(["ID", "Name"], [["1", "a"]])).toEqual(["ID"]);
  });

  it("falls back to the first unique column", () => {
    expect(
      inferKeyColumns(["Tier", "Value"], [
        ["1", "a"],
        ["2", "a"],
      ]),
    ).toEqual(["Tier"]);
  });

  it("returns no key when nothing is unique", () => {
    expect(
      inferKeyColumns(["A", "B"], [
        ["1", "x"],
        ["1", "x"],
      ]),
    ).toEqual([]);
  });
});

describe("compareCsvConfigContent", () => {
  const base = "Id,Power\nint,int\n1,10\n2,20\n";

  it("reports value changes, additions, and removals", () => {
    const findings = compareCsvConfigContent({
      filePath: "ItemData.csv",
      keyColumns: ["Id"],
      baseContent: base,
      currentContent: "Id,Power\nint,int\n1,15\n3,30\n",
    });
    const codes = findings.map((finding) => finding.code);
    expect(codes).toContain("CONFIG_VALUE_CHANGED");
    expect(codes).toContain("CONFIG_RECORD_ADDED");
    expect(codes).toContain("CONFIG_RECORD_REMOVED");
  });

  it("reports schema changes instead of row diffs", () => {
    const findings = compareCsvConfigContent({
      filePath: "ItemData.csv",
      keyColumns: ["Id"],
      baseContent: base,
      currentContent: "Id,Power,Extra\nint,int,int\n1,10,0\n",
    });
    expect(findings.map((finding) => finding.code)).toEqual([
      "CONFIG_SCHEMA_CHANGED",
    ]);
  });

  it("falls back to content-changed without a stable key", () => {
    const findings = compareCsvConfigContent({
      filePath: "Unknown.csv",
      keyColumns: [],
      baseContent: base,
      currentContent: "Id,Power\nint,int\n1,99\n2,20\n",
    });
    expect(findings.map((finding) => finding.code)).toEqual([
      "CONFIG_CSV_CONTENT_CHANGED",
    ]);
  });
});
