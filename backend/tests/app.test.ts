import request from "supertest";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { createApp } from "../src/http/app.js";
import { AnalysisService } from "../src/modules/analysis/analysis.service.js";
import { InMemoryAnalysisRunRepository } from "../src/persistence/memory.repository.js";

function createTestApp(): ReturnType<typeof createApp> {
  const config = loadConfig({
    ...process.env,
    PERSISTENCE_DRIVER: "memory",
    PORT: "3000",
  });
  const repository = new InMemoryAnalysisRunRepository();
  const service = new AnalysisService(repository, config, null);
  return createApp({ config, analysisService: service });
}

describe("http", () => {
  it("exposes health with persistence and ai status", async () => {
    const response = await request(createTestApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.persistence).toBe("memory");
    expect(response.body.ai.configured).toBe(false);
  });

  it("validates inspect and analysis payloads", async () => {
    const app = createTestApp();
    const badInspect = await request(app)
      .post("/api/projects/inspect")
      .send({});
    expect(badInspect.status).toBe(400);

    const badAnalysis = await request(app)
      .post("/api/analysis-runs")
      .send({ localPath: "x" });
    expect(badAnalysis.status).toBe(400);
  });

  it("returns 404 for unknown runs and routes", async () => {
    const app = createTestApp();
    const missing = await request(app).get("/api/analysis-runs/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ANALYSIS_RUN_NOT_FOUND");

    const unknown = await request(app).get("/nope");
    expect(unknown.status).toBe(404);
  });
});
