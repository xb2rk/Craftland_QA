import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type {
  AnalysisRun,
  RunExchange,
} from "../src/modules/analysis/analysis-run.entity.js";
import { FileAnalysisRunRepository } from "../src/persistence/file.repository.js";

function makeRun(overrides: Partial<AnalysisRun> & { id: string }): AnalysisRun {
  return {
    kind: "analysis",
    localPath: "C:/repo",
    baseRef: "HEAD~1",
    currentRef: "WORKTREE",
    goal: "test goal",
    status: "completed",
    createdAt: new Date().toISOString(),
    findings: [],
    ...overrides,
  };
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "cqa-file-repo-"));
}

describe("FileAnalysisRunRepository", () => {
  it("persists runs across repository instances", async () => {
    const dir = await tempDir();
    try {
      const first = new FileAnalysisRunRepository(dir);
      await first.save(makeRun({ id: "run-1", createdAt: "2026-09-01T00:00:00.000Z" }));

      const second = new FileAnalysisRunRepository(dir);
      const found = await second.findById("run-1");
      expect(found?.goal).toBe("test goal");
      expect(found?.status).toBe("completed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists newest runs first with a limit", async () => {
    const dir = await tempDir();
    try {
      const repo = new FileAnalysisRunRepository(dir);
      await repo.save(makeRun({ id: "a", createdAt: "2026-09-01T00:00:00.000Z" }));
      await repo.save(makeRun({ id: "b", createdAt: "2026-09-03T00:00:00.000Z" }));
      await repo.save(makeRun({ id: "c", createdAt: "2026-09-02T00:00:00.000Z" }));

      const listed = await repo.list(2);
      expect(listed.map((run) => run.id)).toEqual(["b", "c"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stores question exchanges on the run", async () => {
    const dir = await tempDir();
    try {
      const repo = new FileAnalysisRunRepository(dir);
      await repo.save(makeRun({ id: "run-1" }));
      const exchange: RunExchange = {
        id: "ex-1",
        question: "Why?",
        answer: "Because.",
        citations: [],
        createdAt: new Date().toISOString(),
      };
      const exchanges = await repo.appendExchange("run-1", exchange);
      expect(exchanges).toHaveLength(1);
      expect(await repo.listExchanges("run-1")).toHaveLength(1);
      expect((await repo.findById("run-1"))?.exchanges).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("marks stale queued runs as failed", async () => {
    const dir = await tempDir();
    try {
      const repo = new FileAnalysisRunRepository(dir);
      await repo.save(makeRun({ id: "stale", status: "queued" }));
      expect(await repo.markStaleRunningAsFailed()).toBe(1);
      expect((await repo.findById("stale"))?.status).toBe("failed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe ids without touching the filesystem", async () => {
    const dir = await tempDir();
    try {
      const repo = new FileAnalysisRunRepository(dir);
      expect(await repo.findById("../evil")).toBeNull();
      expect(await repo.listExchanges("a/b")).toEqual([]);
      expect(await repo.appendExchange("..", {
        id: "ex",
        question: "q",
        answer: "a",
        citations: [],
        createdAt: new Date().toISOString(),
      })).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
