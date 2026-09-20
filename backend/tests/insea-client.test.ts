import { describe, expect, it } from "vitest";

import { InseaWorkflowClient } from "../src/modules/ai/insea.client.js";
import { AIProtocolError } from "../src/shared/errors.js";

function input() {
  return {
    requestId: "req-1",
    analysisId: "run-1",
    prompt: "prompt",
    manifest: { stage: "impact_analysis" },
    files: [],
  };
}

describe("InseaWorkflowClient", () => {
  it("includes the upstream body in non-retryable errors", async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 400,
      text: async () => "manifest rejected: DataList is empty",
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const client = new InseaWorkflowClient({
      url: "https://example.test/run",
      apiKey: "key",
      maxRetries: 0,
      fetchImpl,
    });
    await expect(client.run(input())).rejects.toThrow(AIProtocolError);
    await expect(client.run(input())).rejects.toThrow(
      "manifest rejected: DataList is empty",
    );
  });

  it("retries transport failures and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 500,
          text: async () => "boom",
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          data: {
            status: "succeeded",
            outputs: {
              result: JSON.stringify({
                summary: { overall_assessment: "ok" },
              }),
            },
          },
        }),
      };
    }) as unknown as typeof fetch;
    const client = new InseaWorkflowClient({
      url: "https://example.test/run",
      apiKey: "key",
      maxRetries: 2,
      fetchImpl,
    });
    const result = await client.run(input());
    expect(calls).toBe(2);
    expect(result.stage).toBe("impact_analysis");
  });
});
