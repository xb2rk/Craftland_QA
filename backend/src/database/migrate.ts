import "../config/environment.js";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RowDataPacket } from "mysql2/promise";

import { createMySqlPoolFromEnvironment } from "./pool.js";

interface MigrationRow extends RowDataPacket {
  version: string;
}

const migrationDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations"
);
const pool = createMySqlPoolFromEnvironment();

if (pool === null) {
  throw new Error(
    "MySQL is not configured. Set DB_HOST, DB_NAME, DB_USER and DB_PASSWORD."
  );
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

const migrationFiles = (await readdir(migrationDirectory))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();

for (const migrationFile of migrationFiles) {
  const [rows] = await pool.query<MigrationRow[]>(
    "SELECT version FROM schema_migrations WHERE version = ?",
    [migrationFile]
  );
  if (rows.length > 0) {
    continue;
  }

  const sql = await readFile(
    path.join(migrationDirectory, migrationFile),
    "utf8"
  );
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const statement of splitSqlStatements(sql)) {
      await connection.query(statement);
    }
    await connection.query(
      "INSERT INTO schema_migrations (version) VALUES (?)",
      [migrationFile]
    );
    await connection.commit();
    console.log(`Applied migration ${migrationFile}.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

await pool.end();

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
