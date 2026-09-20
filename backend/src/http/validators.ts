import { z } from "zod";

export const inspectProjectBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
});

export const analysisLensSchema = z.enum([
  "pre_merge",
  "balance",
  "economy",
  "localization",
  "explain",
  "test_plan",
]);

export const verbositySchema = z.enum(["short", "medium", "long", "auto"]);

export const createAnalysisBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("HEAD~1"),
  currentRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  goal: z.string().trim().min(1).max(4000),
  lens: analysisLensSchema.default("pre_merge"),
  verbosity: verbositySchema.default("auto"),
  focusPaths: z.array(z.string().trim().min(1).max(1024)).max(50).default([]),
  notes: z.string().trim().max(2000).optional(),
});

export const projectDiffBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("HEAD~1"),
  currentRef: z.string().trim().min(1).max(255).default("WORKTREE"),
});

export const whatIfBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  filePath: z.string().trim().min(1).max(1024),
  keyColumn: z.string().trim().min(1).max(255).optional(),
  keyValue: z.string().trim().min(1).max(1024),
  column: z.string().trim().min(1).max(255),
  newValue: z.string().trim().max(4096),
  goal: z.string().trim().max(4000).optional(),
});

export const writerBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("HEAD~1"),
  currentRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  kind: z.enum(["commit", "pr"]),
  goal: z.string().trim().max(4000).optional(),
});

export const localizationBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  goal: z.string().trim().max(4000).optional(),
});

export const askQuestionBodySchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

export const importRunBodySchema = z.object({
  run: z.record(z.string(), z.unknown()),
});

export const compareAnalysesBodySchema = z.object({
  analysisRunAId: z.string().trim().min(1).max(100),
  analysisRunBId: z.string().trim().min(1).max(100),
  goal: z.string().trim().min(1).max(4000),
});

export const listAnalysesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const browseProjectsQuerySchema = z.object({
  path: z.string().trim().max(2048).optional(),
});

export const projectRefsQuerySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
});

export const searchCommitsQuerySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  search: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type InspectProjectBody = z.infer<typeof inspectProjectBodySchema>;
export type CreateAnalysisBody = z.infer<typeof createAnalysisBodySchema>;
export type CompareAnalysesBody = z.infer<typeof compareAnalysesBodySchema>;
