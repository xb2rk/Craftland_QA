import "./config/environment.js";

import { createApp } from "./app.js";
import { createMySqlPoolFromEnvironment } from "./database/pool.js";
import { InMemoryAnalysisRunRepository } from "./repositories/analysis-run-repository.js";
import { MySqlAnalysisRunRepository } from "./repositories/mysql-analysis-run-repository.js";
import { AnalysisRunner } from "./services/analysis-runner.js";
import { InseaWorkflowClient } from "./services/ai/insea-workflow-client.js";

const port = Number(process.env.PORT ?? 3000);
const pool = createMySqlPoolFromEnvironment();
const repository =
  pool === null
    ? new InMemoryAnalysisRunRepository()
    : new MySqlAnalysisRunRepository(pool);
const aiClient =
  process.env.AI_WORKFLOW_URL && process.env.AI_WORKFLOW_API_KEY
    ? new InseaWorkflowClient({
        url: process.env.AI_WORKFLOW_URL,
        apiKey: process.env.AI_WORKFLOW_API_KEY,
        timeoutMs: Number(process.env.AI_WORKFLOW_TIMEOUT_MS ?? 180_000)
      })
    : undefined;
const analysisRunner = new AnalysisRunner(repository, {
  aiClient,
  maxAiFiles: 30,
  maxAiBytes: Number(
    process.env.AI_WORKFLOW_MAX_CONTEXT_BYTES ?? 20 * 1024 * 1024
  )
});
const app = createApp({
  analysisRunner,
  aiConfigured: aiClient !== undefined
});

app.listen(port, () => {
  console.log(`Craftland Quality Analyzer backend listening on port ${port}.`);
});
