import { realpath, stat } from "node:fs/promises";

import {
  discoverProjectFiles,
  type DiscoveredFile
} from "./project-discovery.js";
import { inspectGitRepository } from "./local-git.js";

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
  localPath: string
): Promise<ProjectInspection> {
  const resolvedPath = await realpath(localPath);
  const resolvedStat = await stat(resolvedPath);
  if (!resolvedStat.isDirectory()) {
    throw new Error("Local project path must be a directory.");
  }

  const repository = await inspectGitRepository(resolvedPath);
  const discovery = await discoverProjectFiles(repository.rootPath);

  return {
    rootPath: repository.rootPath,
    repository: {
      branch: repository.branch,
      headCommit: repository.headCommit,
      hasUncommittedChanges: repository.hasUncommittedChanges
    },
    summary: {
      configFiles: countByKind(discovery.files, "config"),
      sourceFiles: countByKind(discovery.files, "source"),
      otherTextFiles: countByKind(discovery.files, "text")
    },
    files: discovery.files,
    truncated: discovery.truncated
  };
}

function countByKind(
  files: DiscoveredFile[],
  kind: DiscoveredFile["kind"]
): number {
  return files.filter((file) => file.kind === kind).length;
}
