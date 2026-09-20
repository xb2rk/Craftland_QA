import { createPool, type Pool } from "mysql2/promise";

import type { AppConfig } from "../config/env.js";

export function createDatabasePool(config: AppConfig): Pool | null {
  if (config.db.driver !== "mysql") return null;
  return createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}
