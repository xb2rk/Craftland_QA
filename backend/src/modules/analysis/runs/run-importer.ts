/**
 * Analysis-run import.
 *
 * Responsibility: validate an exported run payload and store it as a new
 * run with a fresh id. Completed runs stay completed; anything else is
 * stored as failed so history never shows a phantom queued run.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AppError } from "../../../shared/errors.js";
import type { AnalysisRun } from "../analysis-run.entity.js";
import type { AnalysisRunRepository } from "../../../persistence/repository.js";

const importedRunSchema = z
  .object({
    kind: z.enum(["analysis", "comparison"]).optional().default("analysis"),
    localPath: z.string().trim().min(1).max(1024),
    baseRef: z.string().trim().min(1).max(255),
    currentRef: z.string().trim().min(1).max(255),
    goal: z.string().trim().min(1).max(4000),
    status: z.enum(["completed", "failed"]).optional().default("completed"),
    projectSummary: z
      .object({
        configFiles: z.number(),
        sourceFiles: z.number(),
        otherTextFiles: z.number(),
      })
      .optional(),
    comparison: z
      .object({
        baseCommit: z.string(),
        currentCommit: z.string(),
        currentIsWorktree: z.boolean(),
        changedFiles: z
          .array(
            z.object({
              changeType: z.enum(["added", "modified", "deleted", "renamed", "untracked"]),
              relativePath: z.string(),
              previousPath: z.string().optional(),
            }),
          )
          .optional()
          .default([]),
        unifiedDiff: z.string().optional(),
        diffTruncated: z.boolean().optional(),
      })
      .optional(),
    findings: z
      .array(
        z.object({
          code: z.string(),
          severity: z.enum(["error", "warning", "info"]),
          message: z.string(),
          filePath: z.string(),
          line: z.number().optional(),
          evidence: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional()
      .default([]),
    aiReport: z.record(z.string(), z.unknown()).optional(),
    aiStatus: z.enum(["not_configured", "completed", "failed", "skipped"]).optional(),
    error: z.string().optional(),
    lens: z
      .enum(["pre_merge", "balance", "economy", "localization", "explain", "test_plan"])
      .optional(),
    verbosity: z.enum(["short", "medium", "long", "auto"]).optional(),
    focusPaths: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .catchall(z.unknown());

export async function importAnalysisRun(
  repository: AnalysisRunRepository,
  raw: Record<string, unknown>,
): Promise<AnalysisRun> {
  const parsed = importedRunSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Imported run JSON is not a valid analysis run.",
    );
  }
  const run: AnalysisRun = {
    ...parsed.data,
    id: randomUUID(),
    status: parsed.data.status === "completed" ? "completed" : "failed",
    createdAt: new Date().toISOString(),
    exchanges: [],
  };
  await repository.save(run);
  const stored = await repository.findById(run.id);
  if (stored === null) throw new AppError("PERSISTENCE_ERROR", 500, "Import failed.");
  return stored;
}
