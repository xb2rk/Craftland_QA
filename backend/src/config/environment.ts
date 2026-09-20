import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

export function findWorkspaceEnvPath(
  startDirectory = dirname(fileURLToPath(import.meta.url))
): string | undefined {
  let directory = startDirectory;

  while (true) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) {
      const envPath = join(directory, ".env");
      return existsSync(envPath) ? envPath : undefined;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

export function loadWorkspaceEnvironment(): void {
  const envPath = findWorkspaceEnvPath();
  if (envPath !== undefined) {
    config({ path: envPath, override: false, quiet: true });
  }
}

loadWorkspaceEnvironment();
