import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { loadConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";

dotenv.config({ quiet: true });

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.db.driver !== "mysql") {
    console.log("PERSISTENCE_DRIVER=memory, nothing to migrate.");
    return;
  }
  const pool = createDatabasePool(config)!;
  try {
    const migrationsDir = path.dirname(fileURLToPath(import.meta.url));
    const files = (await readdir(path.join(migrationsDir, "migrations")))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      )`,
    );
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const [applied] = await pool.query(
        "SELECT version FROM schema_migrations WHERE version = ?",
        [version],
      );
      if ((applied as unknown[]).length > 0) continue;
      const sql = await readFile(
        path.join(migrationsDir, "migrations", file),
        "utf8",
      );
      const connection = await pool.getConnection();
      try {
        for (const statement of splitStatements(sql)) {
          await connection.query(statement);
        }
        await connection.query(
          "INSERT INTO schema_migrations (version) VALUES (?)",
          [version],
        );
        console.log(`Applied migration ${version}.`);
      } finally {
        connection.release();
      }
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
