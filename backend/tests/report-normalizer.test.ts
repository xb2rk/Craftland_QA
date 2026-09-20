import { describe, expect, it } from "vitest";

import { normalizeAiReport } from "../src/modules/ai/report-normalizer.js";

describe("normalizeAiReport", () => {
  it("fills missing sections with safe defaults", () => {
    const normalized = normalizeAiReport({ summary: {} });
    expect(normalized.summary.overall_assessment.length).toBeGreaterThan(0);
    expect(normalized.findings).toEqual([]);
    expect(normalized.recommendations).toEqual([]);
    expect(normalized.unknowns).toEqual([]);
  });

  it("normalizes invalid severity and scope values", () => {
    const normalized = normalizeAiReport({
      summary: { change_scope: "HUGE" },
      findings: [{ severity: "bogus" }],
      recommendations: [{}],
    });
    expect(normalized.summary.change_scope).toBe("unknown");
    expect(
      (normalized.findings[0] as Record<string, unknown>).severity,
    ).toBe("info");
    expect(
      (normalized.recommendations[0] as Record<string, unknown>).recommendation,
    ).toBe("Review the reported findings.");
  });
});
