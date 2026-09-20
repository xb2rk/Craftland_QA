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
  readLocalizationShape,
} from "../src/modules/localization/localization-checker.js";
import { applyTranslations } from "../src/modules/localization/localization.service.js";
import {
  deterministicWriterText,
  readRepoConventions,
} from "../src/modules/writers/writer.service.js";
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
    expect(openapi.body.info.version).toBe("2.2.0");
    expect(openapi.body.paths["/api/projects/write"]).toBeDefined();
    expect(openapi.body.paths["/api/projects/localization"]).toBeDefined();
    expect(openapi.body.paths["/api/projects/localization/ask"]).toBeDefined();
  });

  it("reads repo conventions when present and skips them when absent", async () => {
    const dir = await makeTempRepo();
    try {
      expect(await readRepoConventions(dir)).toEqual([]);
      await writeFile(path.join(dir, "AGENTS.md"), "# Conventions\n");
      const found = await readRepoConventions(dir);
      expect(found.map((entry) => entry.source)).toEqual(["AGENTS.md"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports discovered conventions on the deterministic draft", async () => {
    const dir = await makeTempRepo();
    try {
      await writeFile(path.join(dir, "AGENTS.md"), "# Conventions\n");
      const draft = await makeService().draftWriter({
        localPath: dir,
        baseRef: "HEAD",
        currentRef: "WORKTREE",
        kind: "commit",
        instructions: "Use scope shop.",
      });
      expect(draft.conventions).toEqual(["AGENTS.md"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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

  it("reads the LanguageKey row into per-column languages", () => {
    const shape = readLocalizationShape(
      "Key,English,Vietnamese\nLanguageKey,en,vi\nGAME_NAME,Garden Invaders,\n",
    );
    expect(shape).toMatchObject({
      keyColumn: "Key",
      languages: ["en", "vi"],
      hasLanguageRow: true,
    });
    const plain = readLocalizationShape("Id,Price\nint,float\n1,100\n");
    expect(plain.hasLanguageRow).toBe(false);
    expect(plain.languages).toEqual([]);
  });

  it("names the language in empty-value findings", () => {
    const { findings, languages } = checkLocalizationFiles([
      {
        relativePath: "Assets/Localization/key.csv",
        content:
          "Key,English,Vietnamese\nLanguageKey,en,vi\nGAME_NAME,Garden Invaders,\n",
      },
    ]);
    expect(languages).toEqual(["en", "vi"]);
    const empty = findings.filter((finding) => finding.code === "LOC_EMPTY_VALUE");
    expect(empty).toHaveLength(1);
    expect(empty[0].message).toContain("GAME_NAME");
    expect(empty[0].message).toContain("vi");
  });

  it("applies translations only to matching cells", () => {
    const content =
      "Key,English,Vietnamese\nLanguageKey,en,vi\nGAME_NAME,Garden Invaders,\nNAN,Placeholder,Placeholder\n";
    const out = applyTranslations(content, [
      { key: "GAME_NAME", language: "vi", oldValue: "", newValue: "Ke xam luoc vuon" },
      { key: "NAN", language: "vi", oldValue: "WRONG", newValue: "Changed" },
      { key: "GAME_NAME", language: "xx", oldValue: "", newValue: "Ignored" },
      { key: "MISSING", language: "vi", oldValue: "", newValue: "Ignored" },
    ]);
    expect(out).toContain("GAME_NAME,Garden Invaders,Ke xam luoc vuon");
    expect(out).toContain("NAN,Placeholder,Placeholder");
  });

  it("scopes the check to one file and reports translate needs AI", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cq-loc-"));
    await git(dir, ["init", "-b", "main"]);
    await git(dir, ["config", "user.email", "test@example.com"]);
    await git(dir, ["config", "user.name", "Test"]);
    await mkdir(path.join(dir, "Assets", "Localization"), { recursive: true });
    await writeFile(
      path.join(dir, "Assets", "Localization", "key.csv"),
      "Key,en,vi\nLanguageKey,en,vi\nsword_name,Sword,\n",
    );
    await writeFile(
      path.join(dir, "Assets", "Localization", "other.csv"),
      "Key,en\nLanguageKey,en\nok,ok\n",
    );
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "add localization"]);
    try {
      const scoped = await makeService().runLocalization({
        localPath: dir,
        baseRef: "WORKTREE",
        filePath: "key.csv",
      });
      expect(scoped.filesChecked).toEqual(["Assets/Localization/key.csv"]);
      expect(scoped.filePath).toBe("Assets/Localization/key.csv");
      expect(scoped.languages).toEqual(["en", "vi"]);

      const translate = await makeService().runLocalization({
        localPath: dir,
        baseRef: "WORKTREE",
        filePath: "key.csv",
        mode: "translate",
      });
      expect(translate.aiStatus).toBe("not_configured");
      expect(translate.error).toContain("Translate mode");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("validates the localization ask payload", async () => {
    const app = createApp({
      config: loadConfig({ ...process.env, PERSISTENCE_DRIVER: "memory", PORT: "3000" }),
      analysisService: makeService(),
    });
    const bad = await request(app)
      .post("/api/projects/localization/ask")
      .send({ localPath: "x", question: "Is this covered?" });
    expect(bad.status).toBe(400);

    const dir = await makeTempRepo();
    try {
      const noAi = await request(app)
        .post("/api/projects/localization/ask")
        .send({ localPath: dir, filePath: "ShopData.csv", question: "q" });
      expect(noAi.status).toBe(400);
      expect(noAi.body.error.code).toBe("AI_NOT_CONFIGURED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
