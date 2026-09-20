import { realpath, readdir, stat } from "node:fs/promises";
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

export interface DirectoryEntry {
  name: string;
  path: string;
  hasSubdirectories: boolean;
  isRepository: boolean;
}

export interface ProjectBranch {
  name: string;
  shortCommit: string;
  upstream: string | null;
  current: boolean;
}

export interface ProjectCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
}

async function resolveRepositoryRoot(
  localPath: string,
  allowedRoots?: string[] | null,
  git: GitClient = sharedGitClient,
): Promise<string> {
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

  const rootPath = await git
    .run(resolvedPath, ["rev-parse", "--show-toplevel"])
    .catch(() => {
      throw new AppError(
        "GIT_ERROR",
        422,
        "Path is not inside a Git repository.",
      );
    });

  if (allowedRoots && allowedRoots.length > 0) {
    const normalizedRoot = path.normalize(rootPath).toLowerCase();
    const allowed = allowedRoots.some((allowedRoot) =>
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
  return rootPath;
}
export async function inspectLocalProject(
  localPath: string,
  options: {
    allowedRoots?: string[] | null;
    git?: GitClient;
  } = {},
): Promise<ProjectInspection> {
  const git = options.git ?? sharedGitClient;
  const rootPath = await resolveRepositoryRoot(
    localPath,
    options.allowedRoots,
    git,
  );

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

export async function listProjectBranches(
  localPath: string,
  options: {
    allowedRoots?: string[] | null;
    git?: GitClient;
  } = {},
): Promise<ProjectBranch[]> {
  const git = options.git ?? sharedGitClient;
  const rootPath = await resolveRepositoryRoot(
    localPath,
    options.allowedRoots,
    git,
  );
  const current =
    (await git.run(rootPath, ["branch", "--show-current"])) || "";
  const output = await git.listBranches(rootPath);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name = "", shortCommit = "", upstream = ""] = line.split("\0");
      return {
        name,
        shortCommit,
        upstream: upstream.length > 0 ? upstream : null,
        current: name.length > 0 && name === current,
      };
    })
    .filter((branch) => branch.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function searchProjectCommits(
  localPath: string,
  options: {
    search?: string;
    limit?: number;
    allowedRoots?: string[] | null;
    git?: GitClient;
  } = {},
): Promise<ProjectCommit[]> {
  const git = options.git ?? sharedGitClient;
  const rootPath = await resolveRepositoryRoot(
    localPath,
    options.allowedRoots,
    git,
  );
  const output = await git.listCommits(rootPath, {
    search: options.search,
    limit: options.limit,
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [hash = "", shortHash = "", author = "", date = "", subject = ""] =
        line.split("\0");
      return { hash, shortHash, author, date, subject };
    })
    .filter((commit) => commit.hash.length > 0);
}

export async function browseDirectories(
  startPath: string | undefined,
  allowedRoots?: string[] | null,
): Promise<{ currentPath: string; parentPath: string | null; entries: DirectoryEntry[] }> {
  const roots = (allowedRoots ?? []).map((root) =>
    path.normalize(root).toLowerCase(),
  );

  let currentPath: string;
  if (!startPath || startPath.length === 0) {
    if (roots.length === 0) {
      throw new AppError(
        "BROWSE_ROOTS_NOT_CONFIGURED",
        400,
        "Set ANALYZED_ROOTS to enable the folder browser, or paste a path directly.",
      );
    }
    const entries = await Promise.all(
      (allowedRoots ?? []).map(async (root) => ({
        name: path.basename(root) || root,
        path: root,
        hasSubdirectories: await hasSubdirectories(root),
        isRepository: await isRepositoryRoot(root),
      })),
    );
    return { currentPath: "", parentPath: null, entries };
  }

  currentPath = await realpath(startPath).catch(() => {
    throw new AppError("VALIDATION_ERROR", 400, "Directory does not exist.");
  });
  const currentStat = await stat(currentPath).catch(() => {
    throw new AppError("VALIDATION_ERROR", 400, "Directory does not exist.");
  });
  if (!currentStat.isDirectory()) {
    throw new AppError("PROJECT_NOT_A_DIRECTORY", 400, "Path must be a directory.");
  }

  if (roots.length > 0) {
    const normalized = path.normalize(currentPath).toLowerCase();
    const inside = roots.some(
      (root) => normalized === root || normalized.startsWith(`${root}${path.sep}`),
    );
    if (!inside) {
      throw new AppError(
        "PROJECT_PATH_NOT_ALLOWED",
        403,
        "Path is outside the allowed analysis roots.",
      );
    }
  }

  const dirents = await readdir(currentPath, { withFileTypes: true });
  const entries = (
    await Promise.all(
      dirents
        .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith("."))
        .map(async (dirent) => {
          const fullPath = path.join(currentPath, dirent.name);
          return {
            name: dirent.name,
            path: fullPath,
            hasSubdirectories: await hasSubdirectories(fullPath),
            isRepository: await isRepositoryRoot(fullPath),
          };
        }),
    )
  ).sort((a, b) => a.name.localeCompare(b.name));

  let parentPath: string | null = path.dirname(currentPath);
  if (roots.length > 0) {
    const normalized = path.normalize(currentPath).toLowerCase();
    const atRoot = roots.some((root) => normalized === root);
    if (atRoot) parentPath = null;
  }

  return { currentPath, parentPath, entries };
}

async function hasSubdirectories(directory: string): Promise<boolean> {
  try {
    const dirents = await readdir(directory, { withFileTypes: true });
    return dirents.some(
      (dirent) => dirent.isDirectory() && !dirent.name.startsWith("."),
    );
  } catch {
    return false;
  }
}

async function isRepositoryRoot(directory: string): Promise<boolean> {
  try {
    const dirents = await readdir(directory);
    if (dirents.includes(".git")) return true;
    return false;
  } catch {
    return false;
  }
}

function countByKind(files: DiscoveredFile[], kind: DiscoveredFile["kind"]): number {
  return files.filter((file) => file.kind === kind).length;
}
