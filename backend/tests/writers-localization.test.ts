import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { createApp } from "../src/http/app.js";
import { AnalysisService } from "../src/modules/analysis/analysis.service.js";
import {
  checkLocalizationFiles,
  isLocalizationFile,
} from "../src/modules/localization/localization-checker.js";
import { deterministicWriterText } from "../src/modules/writers/writer.service.js";
import { InMemoryAnalysisRunRepository } from "../src/persistence/memory.repository.js";

const execFileAsync = promisify(execFile);

async function git(dir: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: dir });
}

async function makeTempRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cq-writer-"));
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await writeFile(path.join(dir, "ShopData.csv"), "Id,Price\nint,float\n1,100\n");
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "add shop data"]);
  // Uncommitted edit so HEAD -> WORKTREE has a diff.
  await writeFile(path.join(dir, "ShopData.csv"), "Id,Price\nint,float\n1,150\n");
  return dir;
}

function makeService(): AnalysisService {
  const config = loadConfig({
    ...process.env,
    PERSISTENCE_DRIVER: "memory",
    PORT: "3000",
  });
  return new AnalysisService(new InMemoryAnalysisRunRepository(), config, null);
}

describe("writers", () => {
  it("drafts a deterministic commit message without AI", async () => {
    const dir = await makeTempRepo();
    try {
      const draft = await makeService().draftWriter({
        localPath: dir,
        baseRef: "HEAD",
        currentRef: "WORKTREE",
        kind: "commit",
      });
      expect(draft.aiStatus).toBe("not_configured");
      expect(draft.text).toContain("ShopData.csv");
      expect(draft.text.split("\n")[0].length).toBeLessThanOrEqual(120);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("drafts a deterministic PR description without AI", async () => {
    const dir = await makeTempRepo();
    try {
      const draft = await makeService().draftWriter({
        localPath: dir,
        baseRef: "HEAD",
        currentRef: "WORKTREE",
        kind: "pr",
      });
      expect(draft.aiStatus).toBe("not_configured");
      expect(draft.text).toContain("## Summary");
      expect(draft.text).toContain("## Test plan");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("builds template text without git", () => {
    const text = deterministicWriterText("commit", "HEAD~1", "WORKTREE", [
      { relativePath: "ShopData.csv", changeType: "modified" },
    ], []);
    expect(text).toMatch(/^chore/);
    expect(text).toContain("ShopData.csv");
  });

  it("validates the write payload and advertises the route", async () => {
    const app = createApp({
      config: loadConfig({ ...process.env, PERSISTENCE_DRIVER: "memory", PORT: "3000" }),
      analysisService: makeService(),
    });
    const bad = await request(app)
      .post("/api/projects/write")
      .send({ localPath: "x", kind: "bogus" });
    expect(bad.status).toBe(400);

    const openapi = await request(app).get("/openapi.json");
    expect(openapi.status).toBe(200);
    expect(openapi.body.info.version).toBe("2.1.0");
    expect(openapi.body.paths["/api/projects/write"]).toBeDefined();
    expect(openapi.body.paths["/api/projects/localization"]).toBeDefined();
  });
});

describe("localization", () => {
  it("detects localization files by directory or name", () => {
    expect(isLocalizationFile("Assets/Localization/key.csv")).toBe(true);
    expect(isLocalizationFile("l10n/strings.csv")).toBe(true);
    expect(isLocalizationFile("Assets/CSV/ShopData.csv")).toBe(false);
    expect(isLocalizationFile("Assets/Scripts/player.fcg")).toBe(false);
  });

  it("flags empty values with key, column, and line", () => {
    const { filesChecked, findings } = checkLocalizationFiles([
      {
        relativePath: "Assets/Localization/key.csv",
        content: "Key,en,vi\nstring,string,string\ngreet,hello,\nok,ok,ok\n",
      },
    ]);
    expect(filesChecked).toEqual(["Assets/Localization/key.csv"]);
    const empty = findings.filter((finding) => finding.code === "LOC_EMPTY_VALUE");
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ filePath: "Assets/Localization/key.csv", line: 3 });
    expect(empty[0].message).toContain("greet");
  });

  it("checks a worktree localization file without AI", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cq-loc-"));
    await git(dir, ["init", "-b", "main"]);
    await git(dir, ["config", "user.email", "test@example.com"]);
    await git(dir, ["config", "user.name", "Test"]);
    await mkdir(path.join(dir, "Assets", "Localization"), { recursive: true });
    await writeFile(
      path.join(dir, "Assets", "Localization", "key.csv"),
      "Key,en,vi\nstring,string,string\nsword_name,Sword,\n",
    );
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "add localization"]);
    try {
      const result = await makeService().runLocalization({
        localPath: dir,
        baseRef: "WORKTREE",
      });
      expect(result.aiStatus).toBe("not_configured");
      expect(result.filesChecked).toHaveLength(1);
      expect(
        result.findings.some((finding) => finding.code === "LOC_EMPTY_VALUE"),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
