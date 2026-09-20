import { describe, expect, it } from "vitest";

import type { AnalysisRun } from "../src/api/types.js";
import {
  checklistItems,
  checklistMarkdown,
  checklistStorageKey,
  issuesMarkdown,
  loadChecklist,
  saveChecklist,
} from "../src/components/run-io.js";

function runWithRecommendations(): AnalysisRun {
  return {
    id: "run-1",
    kind: "analysis",
    localPath: "/repo",
    baseRef: "HEAD~1",
    currentRef: "WORKTREE",
    goal: "Verify mission changes",
    status: "completed",
    createdAt: new Date().toISOString(),
    findings: [],
    aiReport: {
      recommendations: [
        {
          id: "R001",
          priority: "high",
          dimension: "config_consistency",
          recommendation: "Normalize key.csv widths.",
          justification: "Deterministic findings confirm mismatches.",
          evidence: [{ file: "key.csv", lines: "685-695" }],
        },
      ],
    },
  };
}

describe("fix-it checklist", () => {
  it("extracts recommendation items", () => {
    const items = checklistItems(runWithRecommendations());
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("R001");
    expect(items[0].priority).toBe("high");
    expect(items[0].text).toContain("Normalize key.csv");
  });

  it("renders markdown with checked state", () => {
    const markdown = checklistMarkdown(runWithRecommendations(), ["R001"]);
    expect(markdown).toContain("# Fix-it checklist — Verify mission changes");
    expect(markdown).toContain("- [x] [high] Normalize key.csv widths.");
    const unchecked = checklistMarkdown(runWithRecommendations(), []);
    expect(unchecked).toContain("- [ ] [high] Normalize key.csv widths.");
  });

  it("round-trips checked ids through storage", () => {
    saveChecklist("run-1", ["R001"]);
    expect(loadChecklist("run-1")).toEqual(["R001"]);
    expect(checklistStorageKey("run-1")).toBe("cqa.checklist.run-1");
  });
});

describe("issues export", () => {
  it("renders one markdown section per finding", () => {
    const markdown = issuesMarkdown({
      ...runWithRecommendations(),
      findings: [
        {
          code: "LOC_EMPTY_VALUE",
          severity: "warning",
          message: "Empty value for key WELCOME.",
          filePath: "Assets/Localization/key.csv",
          line: 12,
        },
        {
          code: "CONFIG_CSV_WIDTH_MISMATCH",
          severity: "error",
          message: "Row 700 has 15 columns, expected 17.",
          filePath: "Assets/Localization/key.csv",
        },
      ],
    });
    expect(markdown).toContain("# Issues — Verify mission changes");
    expect(markdown).toContain("## [warning] LOC_EMPTY_VALUE");
    expect(markdown).toContain("`Assets/Localization/key.csv:12`");
    expect(markdown).toContain("## [error] CONFIG_CSV_WIDTH_MISMATCH");
  });

  it("renders an empty state when there are no findings", () => {
    expect(issuesMarkdown(runWithRecommendations())).toContain("No deterministic findings");
  });
});
