import type { Pool } from "mysql2/promise";

import type { AppConfig } from "../config/env.js";
import type { AnalysisRunRepository } from "./repository.js";
import { InMemoryAnalysisRunRepository } from "./memory.repository.js";
import { FileAnalysisRunRepository } from "./file.repository.js";
import { MySqlAnalysisRunRepository } from "./mysql.repository.js";

export function createAnalysisRunRepository(
  config: AppConfig,
  pool: Pool | null,
): AnalysisRunRepository {
  if (config.db.driver === "file") {
    return new FileAnalysisRunRepository(config.db.dir);
  }
  if (config.db.driver === "mysql") {
    if (pool === null) {
      throw new Error("MySQL pool is required when PERSISTENCE_DRIVER=mysql.");
    }
    return new MySqlAnalysisRunRepository(pool);
  }
  return new InMemoryAnalysisRunRepository();
}
