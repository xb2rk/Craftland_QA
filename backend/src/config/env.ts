import path from "node:path";

import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalNonEmptyString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  PERSISTENCE_DRIVER: z.enum(["memory", "file", "mysql"]).default("file"),
  FILE_STORE_DIR: optionalNonEmptyString,
  DB_HOST: optionalNonEmptyString,
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: optionalNonEmptyString,
  DB_USER: optionalNonEmptyString,
  DB_PASSWORD: z.string().default(""),
  AI_WORKFLOW_URL: z.preprocess(
    emptyToUndefined,
    z.string().trim().url().optional(),
  ),
  AI_WORKFLOW_API_KEY: z.preprocess(emptyToUndefined, optionalNonEmptyString),
  AI_WORKFLOW_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(180_000),
  AI_WORKFLOW_MAX_CONTEXT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024)
    .default(500_000),
  AI_WORKFLOW_MAX_FILES: z.coerce.number().int().min(1).max(100).default(30),
  AI_WORKFLOW_MAX_FOLLOW_UP_ROUNDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(5)
    .default(2),
  ANALYZED_ROOTS: z.preprocess(
    emptyToUndefined,
    z.string().trim().optional(),
  ),
});

export type AppConfig = {
  port: number;
  logLevel: z.infer<typeof envSchema>["LOG_LEVEL"];
  persistenceDriver: "memory" | "file" | "mysql";
  db:
    | { driver: "memory" }
    | { driver: "file"; dir: string }
    | {
        driver: "mysql";
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
      };
  ai:
    | { configured: false }
    | {
        configured: true;
        url: string;
        apiKey: string;
        timeoutMs: number;
        maxContextBytes: number;
        maxFiles: number;
        maxFollowUpRounds: number;
      };
  analyzedRoots: string[] | null;
};

export function loadConfig(
  rawEnv: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.message}`,
    );
  }
  const env = parsed.data;

  const aiUrl = env.AI_WORKFLOW_URL;
  const aiKey = env.AI_WORKFLOW_API_KEY;

  if (env.PERSISTENCE_DRIVER === "mysql") {
    if (!env.DB_HOST || !env.DB_NAME || !env.DB_USER) {
      throw new Error(
        "DB_HOST, DB_NAME and DB_USER are required when PERSISTENCE_DRIVER=mysql.",
      );
    }
  }

  const storeDir = path.resolve(process.cwd(), env.FILE_STORE_DIR ?? "data");

  return {
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    persistenceDriver: env.PERSISTENCE_DRIVER,
    db:
      env.PERSISTENCE_DRIVER === "mysql"
        ? {
            driver: "mysql",
            host: env.DB_HOST!,
            port: env.DB_PORT,
            database: env.DB_NAME!,
            user: env.DB_USER!,
            password: env.DB_PASSWORD,
          }
        : env.PERSISTENCE_DRIVER === "file"
          ? { driver: "file", dir: storeDir }
          : { driver: "memory" },
    ai: aiUrl !== undefined && aiKey !== undefined
      ? {
          configured: true,
          url: aiUrl,
          apiKey: aiKey,
          timeoutMs: env.AI_WORKFLOW_TIMEOUT_MS,
          maxContextBytes: env.AI_WORKFLOW_MAX_CONTEXT_BYTES,
          maxFiles: env.AI_WORKFLOW_MAX_FILES,
          maxFollowUpRounds: env.AI_WORKFLOW_MAX_FOLLOW_UP_ROUNDS,
        }
      : { configured: false },
    analyzedRoots:
      env.ANALYZED_ROOTS && env.ANALYZED_ROOTS.length > 0
        ? env.ANALYZED_ROOTS.split(",")
            .map((root) => root.trim())
            .filter((root) => root.length > 0)
        : null,
  };
}
