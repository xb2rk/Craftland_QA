import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { ProjectInspection } from "./project-inspector.js";
import {
  classifyRepositoryPath,
  type DiscoveredFile
} from "./project-discovery.js";

const execFileAsync = promisify(execFile);

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
  } = {}
): Promise<GitRevisionSnapshot> {
  const maxFiles = options.maxFiles ?? 10_000;
  const maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
  const snapshotRoot = await mkdtemp(
    path.join(tmpdir(), "craftland-quality-analyzer-")
  );
  const files: DiscoveredFile[] = [];
  let truncated = false;

  try {
    const fileList = await runGit(baseInspection.rootPath, [
      "ls-tree",
      "-r",
      "--name-only",
      revision
    ]);
    const allCandidatePaths = fileList
      .split(/\r?\n/)
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
            includedPaths.has(relativePath)
          );

    for (const relativePath of candidatePaths) {
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
      const content = await runGit(baseInspection.rootPath, [
        "show",
        `${revision}:${relativePath}`
      ]);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      if (sizeBytes > maxFileBytes) {
        continue;
      }

      const absolutePath = path.join(
        snapshotRoot,
        ...relativePath.split("/")
      );
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
      const extension = path.extname(relativePath).toLowerCase();
      const kind = classifyRepositoryPath(relativePath);
      if (kind === null) {
        continue;
      }
      files.push({
        relativePath,
        absolutePath,
        extension,
        sizeBytes,
        kind
      });
    }

    files.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    );
    return {
      inspection: {
        ...baseInspection,
        summary: {
          configFiles: countPathsByKind(allCandidatePaths, "config"),
          sourceFiles: countPathsByKind(allCandidatePaths, "source"),
          otherTextFiles: countPathsByKind(allCandidatePaths, "text")
        },
        files,
        truncated
      },
      cleanup: () => rm(snapshotRoot, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

function countPathsByKind(
  paths: string[],
  kind: DiscoveredFile["kind"]
): number {
  return paths.filter((relativePath) => classifyRepositoryPath(relativePath) === kind)
    .length;
}

async function runGit(
  workingDirectory: string,
  args: string[]
): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: workingDirectory,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return result.stdout;
}
