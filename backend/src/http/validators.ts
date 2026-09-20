import { z } from "zod";

export const inspectProjectBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
});

export const createAnalysisBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("HEAD~1"),
  currentRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  goal: z.string().trim().min(1).max(4000),
});

export const compareAnalysesBodySchema = z.object({
  analysisRunAId: z.string().trim().min(1).max(100),
  analysisRunBId: z.string().trim().min(1).max(100),
  goal: z.string().trim().min(1).max(4000),
});

export const listAnalysesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type InspectProjectBody = z.infer<typeof inspectProjectBodySchema>;
export type CreateAnalysisBody = z.infer<typeof createAnalysisBodySchema>;
export type CompareAnalysesBody = z.infer<typeof compareAnalysesBodySchema>;
