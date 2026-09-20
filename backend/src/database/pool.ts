import { createPool, type Pool } from "mysql2/promise";

export function createMySqlPoolFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): Pool | null {
  const driver = (environment.PERSISTENCE_DRIVER ?? "memory")
    .trim()
    .toLowerCase();

  if (driver === "memory") {
    return null;
  }
  if (driver !== "mysql") {
    throw new Error(
      'PERSISTENCE_DRIVER must be either "memory" or "mysql".'
    );
  }

  const host = environment.DB_HOST?.trim();
  const database = environment.DB_NAME?.trim();
  const user = environment.DB_USER?.trim();

  if (!host || !database || !user) {
    throw new Error(
      "DB_HOST, DB_NAME and DB_USER are required when PERSISTENCE_DRIVER=mysql."
    );
  }

  return createPool({
    host,
    port: Number(environment.DB_PORT ?? 3306),
    database,
    user,
    password: environment.DB_PASSWORD ?? "",
    connectionLimit: 5,
    enableKeepAlive: true,
    decimalNumbers: true,
    timezone: "Z"
  });
}
