import { DEFAULT_DIFF_LIMITS } from "../../config/constants.js";
import { classifyRepositoryPath } from "../discovery/file-classifier.js";
import { GitClient, sharedGitClient } from "./git-client.js";

export interface ChangedFile {
  changeType: "added" | "modified" | "deleted" | "renamed" | "untracked";
  relativePath: string;
  previousPath?: string;
}

export interface GitComparison {
  baseCommit: string;
  currentCommit: string;
  currentIsWorktree: boolean;
  changedFiles: ChangedFile[];
  unifiedDiff: string;
  diffTruncated: boolean;
}

export async function compareGitRevisions(
  repositoryRoot: string,
  baseRef: string,
  currentRef: string,
  options: { maxDiffCharacters?: number; git?: GitClient } = {},
): Promise<GitComparison> {
  const git = options.git ?? sharedGitClient;
  const maxDiffCharacters =
    options.maxDiffCharacters ?? DEFAULT_DIFF_LIMITS.maxDiffCharacters;
  const baseCommit = await git.resolveCommit(repositoryRoot, baseRef);
  const currentIsWorktree = currentRef.toUpperCase() === "WORKTREE";
  const currentCommit = await git.resolveCommit(
    repositoryRoot,
    currentIsWorktree ? "HEAD" : currentRef,
  );
  const comparisonArgs = currentIsWorktree
    ? [baseCommit]
    : [baseCommit, currentCommit];

  const nameStatus = await git.run(repositoryRoot, [
    "diff",
    "--name-status",
    ...comparisonArgs,
  ]);
  const changedFiles = parseNameStatus(nameStatus).filter(
    isSupportedAnalysisChange,
  );

  if (currentIsWorktree) {
    const status = await git.run(repositoryRoot, [
      "status",
      "--porcelain",
      "--untracked-files=all",
    ]);
    appendUntrackedFiles(changedFiles, status);
  }

  const relevantChangedFiles = deduplicateChangedFiles(changedFiles);
  const trackedPaths = relevantChangedFiles
    .filter((file) => file.changeType !== "untracked")
    .flatMap((file) =>
      file.previousPath === undefined
        ? [file.relativePath]
        : [file.previousPath, file.relativePath],
    );
  const rawDiff =
    trackedPaths.length === 0
      ? ""
      : await git.run(repositoryRoot, [
          "diff",
          "--no-ext-diff",
          "--unified=3",
          ...comparisonArgs,
          "--",
          ...trackedPaths,
        ]);
  const diffTruncated = rawDiff.length > maxDiffCharacters;

  return {
    baseCommit,
    currentCommit,
    currentIsWorktree,
    changedFiles: relevantChangedFiles,
    unifiedDiff: diffTruncated ? rawDiff.slice(0, maxDiffCharacters) : rawDiff,
    diffTruncated,
  };
}

function parseNameStatus(output: string): ChangedFile[] {
  if (output.length === 0) return [];
  return output
    .split(/\r?\n/)
    .map((line): ChangedFile | null => {
      const [status, firstPath, secondPath] = line.split("\t");
      if (firstPath === undefined) return null;
      if (status.startsWith("R") && secondPath !== undefined) {
        return {
          changeType: "renamed",
          previousPath: normalizePath(firstPath),
          relativePath: normalizePath(secondPath),
        };
      }
      const changeType =
        status === "A" ? "added" : status === "D" ? "deleted" : "modified";
      return { changeType, relativePath: normalizePath(firstPath) };
    })
    .filter((file): file is ChangedFile => file !== null);
}

function appendUntrackedFiles(files: ChangedFile[], statusOutput: string): void {
  for (const line of statusOutput.split(/\r?\n/)) {
    if (!line.startsWith("?? ")) continue;
    const relativePath = normalizePath(line.slice(3));
    if (classifyRepositoryPath(relativePath) === null) continue;
    files.push({ changeType: "untracked", relativePath });
  }
}

function isSupportedAnalysisChange(file: ChangedFile): boolean {
  return (
    classifyRepositoryPath(file.relativePath) !== null ||
    (file.previousPath !== undefined &&
      classifyRepositoryPath(file.previousPath) !== null)
  );
}

function deduplicateChangedFiles(files: ChangedFile[]): ChangedFile[] {
  const deduplicated = new Map<string, ChangedFile>();
  for (const file of files) deduplicated.set(file.relativePath, file);
  return [...deduplicated.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^"|"$/g, "");
}
