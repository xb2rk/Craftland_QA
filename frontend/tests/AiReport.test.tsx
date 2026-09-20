import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiReport } from "../src/components/AiReport.js";

describe("AiReport", () => {
  it("renders partial payloads with defaults", () => {
    render(<AiReport report={{ summary: {} }} />);
    expect(screen.getByText("Summary")).toBeDefined();
    expect(screen.getByText("No AI findings.")).toBeDefined();
  });

  it("renders findings and recommendations", () => {
    render(
      <AiReport
        report={{
          summary: {
            overall_assessment: "Risky change.",
            risk_level: "high",
            confidence: "medium",
            change_scope: "high",
          },
          findings: [
            {
              id: "f1",
              title: "Drop rate changed",
              severity: "high",
              description: "Boss drop changed 10 to 50.",
            },
          ],
          recommendations: [
            {
              id: "r1",
              priority: "high",
              recommendation: "Verify in staging.",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Drop rate changed")).toBeDefined();
    expect(screen.getByText("Verify in staging.")).toBeDefined();
  });

  it("shows a fallback when no report exists", () => {
    render(<AiReport report={undefined} />);
    expect(screen.getByText("No AI report.")).toBeDefined();
  });
});
