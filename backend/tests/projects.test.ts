import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  browseDirectories,
  listProjectBranches,
  searchProjectCommits,
} from "../src/modules/projects/project.service.js";

const execFileAsync = promisify(execFile);

async function git(dir: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: dir });
}

async function makeTempRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cq-proj-"));
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await writeFile(path.join(dir, "notes.txt"), "hello\n");
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "initial balance commit"]);
  await git(dir, ["checkout", "-b", "feature/shop-prices"]);
  await writeFile(path.join(dir, "notes.txt"), "hello shop\n");
  await git(dir, ["commit", "-am", "tune shop prices"]);
  return dir;
}

describe("project refs", () => {
  it("lists branches with current marked and searches commits", async () => {
    const dir = await makeTempRepo();
    try {
      const branches = await listProjectBranches(dir);
      expect(branches.map((branch) => branch.name).sort()).toEqual([
        "feature/shop-prices",
        "main",
      ]);
      expect(branches.find((branch) => branch.current)?.name).toBe(
        "feature/shop-prices",
      );

      const all = await searchProjectCommits(dir, { limit: 10 });
      expect(all).toHaveLength(2);

      const searched = await searchProjectCommits(dir, { search: "shop" });
      expect(searched).toHaveLength(1);
      expect(searched[0].subject).toContain("shop");
      expect(searched[0].shortHash).toMatch(/^[0-9a-f]+$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves a hash prefix directly", async () => {
    const dir = await makeTempRepo();
    try {
      const all = await searchProjectCommits(dir, { limit: 1 });
      const prefix = all[0].hash.slice(0, 8);
      const found = await searchProjectCommits(dir, { search: prefix });
      expect(found.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("browseDirectories", () => {
  it("lists allowed roots and enforces the boundary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cq-browse-"));
    const child = path.join(root, "game-project");
    await mkdir(path.join(child, ".git"), { recursive: true });
    await mkdir(path.join(child, "assets"), { recursive: true });
    try {
      const roots = await browseDirectories(undefined, [root]);
      expect(roots.entries.map((entry) => entry.path)).toEqual([root]);

      const listed = await browseDirectories(root, [root]);
      expect(listed.entries).toHaveLength(1);
      expect(listed.entries[0]).toMatchObject({
        name: "game-project",
        isRepository: true,
        hasSubdirectories: true,
      });
      expect(listed.parentPath).toBeNull();

      await expect(browseDirectories(tmpdir(), [root])).rejects.toMatchObject({
        code: "PROJECT_PATH_NOT_ALLOWED",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires roots when no path is given", async () => {
    await expect(browseDirectories(undefined, null)).rejects.toMatchObject({
      code: "BROWSE_ROOTS_NOT_CONFIGURED",
    });
  });
});
