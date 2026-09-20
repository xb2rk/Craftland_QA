import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { AppError } from "../../shared/errors.js";
import {
  discoverProjectFiles,
  type ProjectDiscovery,
} from "../discovery/discovery.service.js";
import type { DiscoveredFile } from "../discovery/file-classifier.js";
import { GitClient, sharedGitClient } from "../git/git-client.js";

export interface ProjectInspection {
  rootPath: string;
  repository: {
    branch: string;
    headCommit: string;
    hasUncommittedChanges: boolean;
  };
  summary: {
    configFiles: number;
    sourceFiles: number;
    otherTextFiles: number;
  };
  files: DiscoveredFile[];
  truncated: boolean;
}

export async function inspectLocalProject(
  localPath: string,
  options: {
    allowedRoots?: string[] | null;
    git?: GitClient;
  } = {},
): Promise<ProjectInspection> {
  const resolvedPath = await realpath(localPath).catch(() => {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Local project path does not exist.",
    );
  });
  const resolvedStat = await stat(resolvedPath);
  if (!resolvedStat.isDirectory()) {
    throw new AppError(
      "PROJECT_NOT_A_DIRECTORY",
      400,
      "Local project path must be a directory.",
    );
  }

  const git = options.git ?? sharedGitClient;
  const rootPath = await git
    .run(resolvedPath, ["rev-parse", "--show-toplevel"])
    .catch(() => {
      throw new AppError(
        "GIT_ERROR",
        422,
        "Path is not inside a Git repository.",
      );
    });

  if (options.allowedRoots && options.allowedRoots.length > 0) {
    const normalizedRoot = path.normalize(rootPath).toLowerCase();
    const allowed = options.allowedRoots.some((allowedRoot) =>
      normalizedRoot.startsWith(path.normalize(allowedRoot).toLowerCase()),
    );
    if (!allowed) {
      throw new AppError(
        "PROJECT_PATH_NOT_ALLOWED",
        403,
        "Project path is outside the allowed analysis roots.",
      );
    }
  }

  const branch =
    (await git.run(rootPath, ["branch", "--show-current"])) || "DETACHED_HEAD";
  const headCommit = await git.run(rootPath, ["rev-parse", "HEAD"]);
  const status = await git.run(rootPath, ["status", "--porcelain"]);
  const discovery: ProjectDiscovery = await discoverProjectFiles(rootPath);

  return {
    rootPath,
    repository: {
      branch,
      headCommit,
      hasUncommittedChanges: status.length > 0,
    },
    summary: {
      configFiles: countByKind(discovery.files, "config"),
      sourceFiles: countByKind(discovery.files, "source"),
      otherTextFiles: countByKind(discovery.files, "text"),
    },
    files: discovery.files,
    truncated: discovery.truncated,
  };
}

function countByKind(files: DiscoveredFile[], kind: DiscoveredFile["kind"]): number {
  return files.filter((file) => file.kind === kind).length;
}
