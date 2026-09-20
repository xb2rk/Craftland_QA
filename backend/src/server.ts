import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./http/app.js";
import { loadConfig } from "./config/env.js";
import { createDatabasePool } from "./database/pool.js";
import { AnalysisService } from "./modules/analysis/analysis.service.js";
import { InseaWorkflowClient } from "./modules/ai/insea.client.js";
import { createAnalysisRunRepository } from "./persistence/factory.js";
import { createLogger, setLogger } from "./shared/logger.js";

dotenv.config({ quiet: true });
dotenv.config({
  quiet: true,
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.env",
  ),
});

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  setLogger(logger);

  const pool = createDatabasePool(config);
  const repository = createAnalysisRunRepository(config, pool);
  const maybeRecoverable = repository as unknown as {
    markStaleRunningAsFailed?: () => Promise<number>;
  };
  if (typeof maybeRecoverable.markStaleRunningAsFailed === "function") {
    try {
      const recovered = await maybeRecoverable.markStaleRunningAsFailed();
      if (recovered > 0) logger.warn({ recovered }, "marked stale runs as failed");
    } catch (error) {
      logger.warn({ err: error }, "stale-run recovery failed");
    }
  }

  const aiClient =
    config.ai.configured === true
      ? new InseaWorkflowClient({
          url: config.ai.url,
          apiKey: config.ai.apiKey,
          timeoutMs: config.ai.timeoutMs,
        })
      : null;
  if (aiClient === null) {
    logger.warn("AI workflow is not configured; deterministic results only.");
  }

  const analysisService = new AnalysisService(repository, config, aiClient);
  const app = createApp({ config, analysisService });

  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        persistence: config.persistenceDriver,
        ai: config.ai.configured,
      },
      "backend listening",
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => void pool?.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
