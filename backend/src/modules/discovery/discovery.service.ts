import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_DISCOVERY_LIMITS } from "../../config/constants.js";
import {
  classifyRepositoryPath,
  isSensitiveFileName,
  normalizeRepoPath,
  type DiscoveredFile,
} from "./file-classifier.js";

export interface ProjectDiscovery {
  rootPath: string;
  files: DiscoveredFile[];
  truncated: boolean;
}

export async function discoverProjectFiles(
  rootPath: string,
  options: { maxFiles?: number; maxFileBytes?: number } = {},
): Promise<ProjectDiscovery> {
  const maxFiles = options.maxFiles ?? DEFAULT_DISCOVERY_LIMITS.maxFiles;
  const maxFileBytes =
    options.maxFileBytes ?? DEFAULT_DISCOVERY_LIMITS.maxFileBytes;
  const files: DiscoveredFile[] = [];
  let truncated = false;

  async function walk(directory: string): Promise<void> {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          !isSensitiveFileName(entry.name) &&
          entry.name.toLowerCase() !== ".git" &&
          entry.name.toLowerCase() !== "node_modules"
        ) {
          const relativeDir = normalizeRepoPath(
            path.relative(rootPath, absolutePath),
          );
          const segments = relativeDir.toLowerCase().split("/");
          const excluded = segments.some((segment) =>
            [
              ".git",
              ".analysis-workspaces",
              "library",
              "libraries",
              "temp",
              "logs",
              "cache",
              "build",
              "builds",
              "obj",
              "node_modules",
              "dist",
              "coverage",
              "usersettings",
            ].includes(segment),
          );
          if (!excluded) await walk(absolutePath);
        }
        continue;
      }
      if (!entry.isFile() || isSensitiveFileName(entry.name)) continue;
      const fileStat = await stat(absolutePath);
      if (fileStat.size > maxFileBytes) continue;
      const relativePath = normalizeRepoPath(
        path.relative(rootPath, absolutePath),
      );
      const kind = classifyRepositoryPath(relativePath);
      if (kind === null) continue;
      files.push({
        relativePath,
        absolutePath,
        extension: path.extname(entry.name).toLowerCase(),
        sizeBytes: fileStat.size,
        kind,
      });
    }
  }

  await walk(rootPath);
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  return { rootPath, files, truncated };
}
