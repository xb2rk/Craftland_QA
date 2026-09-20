import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type DiscoveredFileKind = "config" | "source" | "text";

export interface DiscoveredFile {
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  kind: DiscoveredFileKind;
}

export interface ProjectDiscovery {
  rootPath: string;
  files: DiscoveredFile[];
  truncated: boolean;
}

const excludedDirectories = new Set([
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
  "coverage"
]);

const excludedFileNames = new Set([
  ".env",
  ".env.local",
  ".npmrc",
  "id_rsa",
  "id_ed25519"
]);

const configExtensions = new Set([
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".xml",
  ".properties"
]);

const sourceExtensions = new Set([
  ".fcg",
  ".fcc",
  ".cs",
  ".lua",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".cpp",
  ".c",
  ".h",
  ".hpp"
]);

const textExtensions = new Set([
  ".md",
  ".txt",
  ".patch",
  ".diff",
  ".asset"
]);

export async function discoverProjectFiles(
  rootPath: string,
  options: { maxFiles?: number; maxFileBytes?: number } = {}
): Promise<ProjectDiscovery> {
  const maxFiles = options.maxFiles ?? 10_000;
  const maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
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
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name.toLowerCase())) {
          await walk(path.join(directory, entry.name));
        }
        continue;
      }
      if (!entry.isFile() || isSensitiveFile(entry.name)) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      const fileStat = await stat(absolutePath);
      if (fileStat.size > maxFileBytes) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const relativePath = normalizePath(path.relative(rootPath, absolutePath));
      const kind = classifyRepositoryPath(relativePath);
      if (kind === null) {
        continue;
      }

      files.push({
        relativePath,
        absolutePath,
        extension,
        sizeBytes: fileStat.size,
        kind
      });
    }
  }

  await walk(rootPath);
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );

  return { rootPath, files, truncated };
}

export function classifyRepositoryPath(
  relativePath: string
): DiscoveredFileKind | null {
  if (isExcludedRepositoryPath(relativePath)) {
    return null;
  }
  const extension = path.extname(relativePath).toLowerCase();
  if (configExtensions.has(extension)) {
    return "config";
  }
  if (sourceExtensions.has(extension)) {
    return "source";
  }
  if (textExtensions.has(extension)) {
    return "text";
  }
  return null;
}

function isSensitiveFile(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  return (
    excludedFileNames.has(normalized) ||
    normalized.startsWith(".env.") ||
    normalized.endsWith(".pem") ||
    normalized.endsWith(".pfx") ||
    normalized.endsWith(".key") ||
    normalized.endsWith(".crt")
  );
}

export function isExcludedRepositoryPath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);
  const segments = normalized.split("/");
  if (
    segments.some((segment) =>
      excludedDirectories.has(segment.toLowerCase())
    )
  ) {
    return true;
  }
  return isSensitiveFile(segments.at(-1) ?? "");
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
