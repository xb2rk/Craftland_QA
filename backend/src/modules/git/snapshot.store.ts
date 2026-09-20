import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ProjectInspection } from "../projects/project.service.js";
import {
  classifyRepositoryPath,
  type DiscoveredFile,
} from "../discovery/file-classifier.js";
import { GitClient, sharedGitClient } from "./git-client.js";

export interface GitRevisionSnapshot {
  inspection: ProjectInspection;
  cleanup: () => Promise<void>;
}

export async function materializeGitRevision(
  baseInspection: ProjectInspection,
  revision: string,
  options: {
    maxFiles?: number;
    maxFileBytes?: number;
    includePaths?: string[];
    git?: GitClient;
  } = {},
): Promise<GitRevisionSnapshot> {
  const git = options.git ?? sharedGitClient;
  const maxFiles = options.maxFiles ?? 10_000;
  const maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
  const snapshotRoot = await mkdtemp(
    path.join(tmpdir(), "craftland-quality-analyzer-"),
  );
  const files: DiscoveredFile[] = [];
  let truncated = false;

  try {
    const fileList = await git.listRevisionFiles(
      baseInspection.rootPath,
      revision,
    );
    const allCandidatePaths = fileList
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^"|"$/g, ""))
      .filter((relativePath) => relativePath.length > 0)
      .filter((relativePath) => classifyRepositoryPath(relativePath) !== null);
    const includedPaths =
      options.includePaths === undefined
        ? undefined
        : new Set(options.includePaths);
    const candidatePaths =
      includedPaths === undefined
        ? allCandidatePaths
        : allCandidatePaths.filter((relativePath) =>
            includedPaths.has(relativePath),
          );

    for (const relativePath of candidatePaths) {
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
      const content = await git.showRevisionFile(
        baseInspection.rootPath,
        revision,
        relativePath,
      );
      const sizeBytes = Buffer.byteLength(content, "utf8");
      if (sizeBytes > maxFileBytes) continue;

      const absolutePath = path.join(snapshotRoot, ...relativePath.split("/"));
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
      const extension = path.extname(relativePath).toLowerCase();
      const kind = classifyRepositoryPath(relativePath);
      if (kind === null) continue;
      files.push({ relativePath, absolutePath, extension, sizeBytes, kind });
    }

    files.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
    return {
      inspection: {
        ...baseInspection,
        summary: {
          configFiles: countPathsByKind(allCandidatePaths, "config"),
          sourceFiles: countPathsByKind(allCandidatePaths, "source"),
          otherTextFiles: countPathsByKind(allCandidatePaths, "text"),
        },
        files,
        truncated,
      },
      cleanup: () => rm(snapshotRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

function countPathsByKind(paths: string[], kind: DiscoveredFile["kind"]): number {
  return paths.filter(
    (relativePath) => classifyRepositoryPath(relativePath) === kind,
  ).length;
}
