import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { createApp } from "../src/http/app.js";
import { buildPrompt, buildWhatIfPrompt } from "../src/modules/ai/prompt.builder.js";
import { AnalysisService } from "../src/modules/analysis/analysis.service.js";
import { InMemoryAnalysisRunRepository } from "../src/persistence/memory.repository.js";

const execFileAsync = promisify(execFile);

async function git(dir: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: dir });
}

const CSV_CONTENT = "Id,Price\nint,int\n1,100\n2,250\n";

async function makeCsvRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cq-whatif-"));
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await mkdir(path.join(dir, "Assets", "CSV"), { recursive: true });
  await writeFile(path.join(dir, "Assets", "CSV", "ShopData.csv"), CSV_CONTENT);
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "add shop data"]);
  await git(dir, ["checkout", "-b", "feature/shop-prices"]);
  await writeFile(
    path.join(dir, "Assets", "CSV", "ShopData.csv"),
    "Id,Price\nint,int\n1,120\n2,250\n",
  );
  await git(dir, ["commit", "-am", "tune shop prices"]);
  return dir;
}

function createTestApp() {
  const config = loadConfig({
    ...process.env,
    PERSISTENCE_DRIVER: "memory",
    PORT: "3000",
    ANALYZED_ROOTS: tmpdir(),
  });
  const repository = new InMemoryAnalysisRunRepository();
  const service = new AnalysisService(repository, config, null);
  return createApp({ config, analysisService: service });
}

describe("prompt verbosity, focus, and notes", () => {
  it("injects a distinct depth block per verbosity", () => {
    const markers = {
      short: "Response depth: short.",
      medium: "Response depth: medium.",
      long: "Response depth: long.",
      auto: "Response depth: auto.",
    } as const;
    for (const [verbosity, marker] of Object.entries(markers)) {
      const prompt = buildPrompt({
        goal: "Check balance",
        verbosity: verbosity as "short",
      });
      expect(prompt).toContain(marker);
    }
  });

  it("adds focus paths and reviewer notes lines", () => {
    const prompt = buildPrompt({
      goal: "Check economy",
      focusPaths: ["Assets/CSV/ShopData.csv"],
      notes: "Watch reward pacing.",
    });
    expect(prompt).toContain(
      "Focus review effort on these files first: Assets/CSV/ShopData.csv.",
    );
    expect(prompt).toContain("Reviewer notes: Watch reward pacing.");
  });

  it("builds a hypothetical single-edit prompt", () => {
    const prompt = buildWhatIfPrompt({
      filePath: "Assets/CSV/ShopData.csv",
      keyColumn: "Id",
      keyValue: "1",
      column: "Price",
      oldValue: "100",
      newValue: "999",
      auditNotes: "Edited row (Id=1)",
    });
    expect(prompt).toContain("hypothetical");
    expect(prompt).toContain("Assets/CSV/ShopData.csv");
    expect(prompt).toContain("999");
  });
});

describe("project diff route", () => {
  it("returns changed files without running AI", async () => {
    const dir = await makeCsvRepo();
    try {
      const res = await request(createTestApp())
        .post("/api/projects/diff")
        .send({ localPath: dir, baseRef: "main", currentRef: "feature/shop-prices" });
      expect(res.status).toBe(200);
      expect(
        res.body.changedFiles.map((file: { relativePath: string }) => file.relativePath),
      ).toContain("Assets/CSV/ShopData.csv");
      expect(typeof res.body.baseCommit).toBe("string");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("what-if route", () => {
  it("evaluates a single-cell edit deterministically without AI", async () => {
    const dir = await makeCsvRepo();
    try {
      const res = await request(createTestApp()).post("/api/projects/whatif").send({
        localPath: dir,
        baseRef: "HEAD",
        filePath: "Assets/CSV/ShopData.csv",
        keyColumn: "Id",
        keyValue: "1",
        column: "Price",
        newValue: "999",
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        keyColumn: "Id",
        keyValue: "1",
        column: "Price",
        oldValue: "120",
        newValue: "999",
        aiStatus: "not_configured",
      });
      expect(Array.isArray(res.body.findings)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown column with a validation error", async () => {
    const dir = await makeCsvRepo();
    try {
      const res = await request(createTestApp()).post("/api/projects/whatif").send({
        localPath: dir,
        baseRef: "HEAD",
        filePath: "Assets/CSV/ShopData.csv",
        keyColumn: "Id",
        keyValue: "1",
        column: "Nope",
        newValue: "5",
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("VALIDATION_ERROR");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("create run with verbosity, focus, and notes", () => {
  it("stores the review options on the queued run", async () => {
    const dir = await makeCsvRepo();
    const app = createTestApp();
    try {
      const res = await request(app).post("/api/analysis-runs").send({
        localPath: dir,
        baseRef: "main",
        currentRef: "feature/shop-prices",
        goal: "Check shop prices",
        verbosity: "short",
        focusPaths: ["Assets/CSV/ShopData.csv"],
        notes: "Watch pacing.",
      });
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        verbosity: "short",
        focusPaths: ["Assets/CSV/ShopData.csv"],
        notes: "Watch pacing.",
      });
      // Wait for the background job to finish before removing the repo.
      const runId = res.body.id as string;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const fetched = await request(app).get(`/api/analysis-runs/${runId}`);
        if (fetched.body.status === "completed" || fetched.body.status === "failed") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
