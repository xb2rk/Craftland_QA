import { describe, expect, it } from "vitest";

import { auditCsvContent } from "../src/modules/configs/csv.auditor.js";

describe("auditCsvContent", () => {
  it("flags duplicate keys on the second occurrence", () => {
    const result = auditCsvContent("Id,Name\nint,string\n1,a\n1,b\n", {
      filePath: "ItemData.csv",
      keyColumns: ["Id"],
    });
    expect(result.rowCount).toBe(2);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "CSV_DUPLICATE_KEY",
    );
    expect(result.findings[0].line).toBe(4);
  });

  it("flags row width mismatches", () => {
    const result = auditCsvContent("Id,Name\nint,string\n1\n", {
      filePath: "ItemData.csv",
      keyColumns: ["Id"],
    });
    expect(result.findings.map((finding) => finding.code)).toContain(
      "CSV_ROW_COLUMN_MISMATCH",
    );
  });

  it("requires header and type rows", () => {
    const result = auditCsvContent("only-one-row\n", {
      filePath: "ItemData.csv",
    });
    expect(result.findings.map((finding) => finding.code)).toContain(
      "CSV_MISSING_HEADER_OR_TYPE_ROW",
    );
  });
});
