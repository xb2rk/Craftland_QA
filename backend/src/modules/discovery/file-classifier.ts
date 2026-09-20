import path from "node:path";

import {
  EXCLUDED_DIRECTORIES,
  EXCLUDED_FILE_NAMES,
  SUPPORTED_CONFIG_EXTENSIONS,
  SUPPORTED_SOURCE_EXTENSIONS,
  SUPPORTED_TEXT_EXTENSIONS,
} from "../../config/constants.js";

export type DiscoveredFileKind = "config" | "source" | "text";

export interface DiscoveredFile {
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  kind: DiscoveredFileKind;
}

export function classifyRepositoryPath(
  relativePath: string,
): DiscoveredFileKind | null {
  if (isExcludedRepositoryPath(relativePath)) {
    return null;
  }
  const extension = path.extname(relativePath).toLowerCase();
  if (SUPPORTED_CONFIG_EXTENSIONS.has(extension)) return "config";
  if (SUPPORTED_SOURCE_EXTENSIONS.has(extension)) return "source";
  if (SUPPORTED_TEXT_EXTENSIONS.has(extension)) return "text";
  return null;
}

export function isExcludedRepositoryPath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/").toLowerCase();
  const segments = normalized.split("/");
  if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) {
    return true;
  }
  return isSensitiveFileName(segments.at(-1) ?? "");
}

export function isSensitiveFileName(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  return (
    EXCLUDED_FILE_NAMES.has(normalized) ||
    normalized.startsWith(".env.") ||
    normalized.endsWith(".pem") ||
    normalized.endsWith(".pfx") ||
    normalized.endsWith(".key") ||
    normalized.endsWith(".crt")
  );
}

export function normalizeRepoPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
