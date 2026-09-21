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

export const whatIfBodySchema = z
  .object({
    localPath: z.string().trim().min(1).max(1024),
    baseRef: z.string().trim().min(1).max(255).default("WORKTREE"),
    filePath: z.string().trim().min(1).max(1024).optional(),
    keyColumn: z.string().trim().min(1).max(255).optional(),
    keyValue: z.string().trim().min(1).max(1024).optional(),
    column: z.string().trim().min(1).max(255).optional(),
    newValue: z.string().trim().max(4096).optional(),
    goal: z.string().trim().max(4000).optional(),
    question: z.string().trim().min(1).max(4000).optional(),
    history: z
      .array(
        z.object({
          question: z.string().trim().max(4000),
          answer: z.string().trim().max(8000),
        }),
      )
      .max(20)
      .optional(),
  })
  .superRefine((value, ctx) => {
    const hasQuestion =
      value.question !== undefined && value.question.trim().length > 0;
    const hasExact =
      value.filePath !== undefined &&
      value.keyValue !== undefined &&
      value.column !== undefined &&
      value.newValue !== undefined;
    if (!hasQuestion && !hasExact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ask a question (question) or provide an exact edit (filePath, keyValue, column, newValue).",
      });
    }
  });

export const writerBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("HEAD~1"),
  currentRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  kind: z.enum(["commit", "pr"]),
  goal: z.string().trim().max(4000).optional(),
  instructions: z.string().trim().max(2000).optional(),
});

export const localizationModeSchema = z.enum(["check", "translate"]);

export const localizationBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  goal: z.string().trim().max(4000).optional(),
  filePath: z.string().trim().min(1).max(1024).optional(),
  mode: localizationModeSchema.default("check"),
  language: z.string().trim().min(1).max(64).optional(),
  key: z.string().trim().min(1).max(255).optional(),
  glossary: z.string().trim().max(4000).optional(),
});

export const localizationAskBodySchema = z.object({
  localPath: z.string().trim().min(1).max(1024),
  baseRef: z.string().trim().min(1).max(255).default("WORKTREE"),
  filePath: z.string().trim().min(1).max(1024),
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        question: z.string().trim().max(2000),
        answer: z.string().trim().max(8000),
      }),
    )
    .max(20)
    .optional(),
  glossary: z.string().trim().max(4000).optional(),
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
