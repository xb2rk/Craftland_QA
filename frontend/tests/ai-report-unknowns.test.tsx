import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiReport } from "../src/components/AiReport.js";

describe("AiReport unknowns", () => {
  it("renders structured unknowns as statement plus evidence, not raw JSON", () => {
    render(
      <AiReport
        report={{
          summary: {
            overall_assessment: "Risky.",
            risk_level: "high",
            confidence: "high",
            change_scope: "medium",
          },
          findings: [],
          recommendations: [],
          unknowns: [
            {
              id: "U001",
              statement: "Whether old event listeners were updated is unknown.",
              evidence: [{ file: "Notify.fcg", lines: "1-10" }],
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByText("Whether old event listeners were updated is unknown."),
    ).toBeDefined();
    expect(screen.getByText("U001")).toBeDefined();
  });
});
