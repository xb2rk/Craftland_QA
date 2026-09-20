import request from "supertest";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { createApp } from "../src/http/app.js";
import { AnalysisService } from "../src/modules/analysis/analysis.service.js";
import type { AnalysisRun } from "../src/modules/analysis/analysis-run.entity.js";
import { buildFollowupPrompt, buildPrompt } from "../src/modules/ai/prompt.builder.js";
import { InMemoryAnalysisRunRepository } from "../src/persistence/memory.repository.js";

function completedRun(): AnalysisRun {
  const now = new Date().toISOString();
  return {
    id: "run-qa-1",
    kind: "analysis",
    status: "completed",
    lens: "pre_merge",
    goal: "Verify mission changes",
    localPath: "/repo",
    baseRef: "HEAD~1",
    currentRef: "WORKTREE",
    comparison: {
      baseCommit: "aaa",
      currentCommit: "WORKTREE",
      currentIsWorktree: true,
      changedFiles: [
        { relativePath: "Assets/CSV/MissionData.csv", changeType: "modified" },
      ],
      unifiedDiff: "diff --git a/Assets/CSV/MissionData.csv",
      diffTruncated: false,
    },
    findings: [
      {
        code: "CONFIG_VALUE_CHANGED",
        severity: "warning",
        message: "Value changed",
        filePath: "Assets/CSV/MissionData.csv",
        line: 3,
      },
    ],
    aiReport: {
      summary: { overall_assessment: "Risky mission change." },
    },
    aiStatus: "completed",
    createdAt: now,
    updatedAt: now,
  };
}

function createServiceWithFakeAi(): {
  app: ReturnType<typeof createApp>;
  repository: InMemoryAnalysisRunRepository;
} {
  const config = loadConfig({
    ...process.env,
    PERSISTENCE_DRIVER: "memory",
    PORT: "3000",
    AI_WORKFLOW_URL: "https://example.test/run",
    AI_WORKFLOW_API_KEY: "test-key",
  });
  const repository = new InMemoryAnalysisRunRepository();
  const fakeClient = {
    async run(): Promise<Record<string, unknown>> {
      return {
        answer: "Verify the localization widths first.",
        citations: ["Assets/CSV/MissionData.csv"],
      };
    },
  };
  const service = new AnalysisService(repository, config, fakeClient);
  return { app: createApp({ config, analysisService: service }), repository };
}

describe("prompt lenses", () => {
  it("injects a distinct instruction block per lens", () => {
    const markers: Record<string, string> = {
      pre_merge: "Lens: pre-merge risk check.",
      balance: "Lens: game balance review.",
      economy: "Lens: game economy audit.",
      localization: "Lens: localization QA.",
      explain: "plain designer language",
      test_plan: "Lens: test-plan generator.",
    };
    for (const [lens, marker] of Object.entries(markers)) {
      const prompt = buildPrompt({
        goal: "Check balance",
        lens: lens as "pre_merge",
      });
      expect(prompt).toContain(marker);
    }
  });

  it("builds a grounded follow-up prompt", () => {
    const prompt = buildFollowupPrompt({
      goal: "Verify mission changes",
      question: "What should I verify first?",
      history: [],
      digest: {
        baseRef: "HEAD~1",
        currentRef: "WORKTREE",
        changedFiles: [{ relativePath: "a.csv", changeType: "modified" }],
        findingCount: 1,
        deterministicFindings: [
          {
            code: "X",
            severity: "warning",
            message: "x",
            filePath: "a.csv",
          },
        ],
        aiAssessment: "risky",
      },
    });
    expect(prompt).toContain("What should I verify first?");
    expect(prompt).toContain("a.csv");
  });
});

describe("run questions", () => {
  it("answers, persists, and lists exchanges", async () => {
    const { app, repository } = createServiceWithFakeAi();
    await repository.save(completedRun());

    const answer = await request(app)
      .post("/api/analysis-runs/run-qa-1/questions")
      .send({ question: "What should I verify first?" });
    expect(answer.status).toBe(201);
    expect(answer.body.answer).toContain("localization");
    expect(answer.body.citations).toContain("Assets/CSV/MissionData.csv");

    const list = await request(app).get("/api/analysis-runs/run-qa-1/questions");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].question).toBe("What should I verify first?");
  });

  it("rejects questions for missing runs", async () => {
    const { app } = createServiceWithFakeAi();
    const missing = await request(app)
      .post("/api/analysis-runs/nope/questions")
      .send({ question: "Hello?" });
    expect(missing.status).toBe(404);
  });

  it("imports an exported run under a new id", async () => {
    const { app } = createServiceWithFakeAi();
    const exported = { ...completedRun(), id: "old-id" };
    const response = await request(app)
      .post("/api/analysis-runs/import")
      .send({ run: exported });
    expect(response.status).toBe(201);
    expect(response.body.id).not.toBe("old-id");
    expect(response.body.status).toBe("completed");

    const fetched = await request(app).get(`/api/analysis-runs/${response.body.id}`);
    expect(fetched.status).toBe(200);
  });
});
