import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  options: { maxDiffCharacters?: number } = {}
): Promise<GitComparison> {
  const maxDiffCharacters = options.maxDiffCharacters ?? 300_000;
  const baseCommit = await resolveRef(repositoryRoot, baseRef);
  const currentIsWorktree = currentRef.toUpperCase() === "WORKTREE";
  const currentCommit = await resolveRef(
    repositoryRoot,
    currentIsWorktree ? "HEAD" : currentRef
  );
  const comparisonArgs = currentIsWorktree
    ? [baseCommit]
    : [baseCommit, currentCommit];

  const nameStatus = await runGit(repositoryRoot, [
    "diff",
    "--name-status",
    ...comparisonArgs
  ]);
  const changedFiles = parseNameStatus(nameStatus).filter(
    isSupportedAnalysisChange
  );

  if (currentIsWorktree) {
    const status = await runGit(repositoryRoot, [
      "status",
      "--porcelain",
      "--untracked-files=all"
    ]);
    appendUntrackedFiles(changedFiles, status);
  }

  const relevantChangedFiles = deduplicateChangedFiles(changedFiles);
  const trackedPaths = relevantChangedFiles
    .filter((file) => file.changeType !== "untracked")
    .flatMap((file) =>
      file.previousPath === undefined
        ? [file.relativePath]
        : [file.previousPath, file.relativePath]
    );
  const rawDiff =
    trackedPaths.length === 0
      ? ""
      : await runGit(repositoryRoot, [
          "diff",
          "--no-ext-diff",
          "--unified=3",
          ...comparisonArgs,
          "--",
          ...trackedPaths
        ]);
  const diffTruncated = rawDiff.length > maxDiffCharacters;

  return {
    baseCommit,
    currentCommit,
    currentIsWorktree,
    changedFiles: relevantChangedFiles,
    unifiedDiff: diffTruncated
      ? rawDiff.slice(0, maxDiffCharacters)
      : rawDiff,
    diffTruncated
  };
}

async function resolveRef(
  repositoryRoot: string,
  reference: string
): Promise<string> {
  return runGit(repositoryRoot, ["rev-parse", "--verify", `${reference}^{commit}`]);
}

async function runGit(
  workingDirectory: string,
  args: string[]
): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: workingDirectory,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
  return result.stdout.trim();
}

function parseNameStatus(output: string): ChangedFile[] {
  if (output.length === 0) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line): ChangedFile | null => {
      const [status, firstPath, secondPath] = line.split("\t");
      if (firstPath === undefined) {
        return null;
      }
      if (status.startsWith("R") && secondPath !== undefined) {
        return {
          changeType: "renamed",
          previousPath: normalizePath(firstPath),
          relativePath: normalizePath(secondPath)
        };
      }
      const changeType =
        status === "A"
          ? "added"
          : status === "D"
            ? "deleted"
            : "modified";
      return {
        changeType,
        relativePath: normalizePath(firstPath)
      };
    })
    .filter((file): file is ChangedFile => file !== null);
}

function appendUntrackedFiles(files: ChangedFile[], statusOutput: string): void {
  for (const line of statusOutput.split(/\r?\n/)) {
    if (!line.startsWith("?? ")) {
      continue;
    }
    const relativePath = normalizePath(line.slice(3));
    if (!isSupportedAnalysisPath(relativePath)) {
      continue;
    }
    files.push({
      changeType: "untracked",
      relativePath
    });
  }
}

function isSupportedAnalysisChange(file: ChangedFile): boolean {
  return (
    isSupportedAnalysisPath(file.relativePath) ||
    (file.previousPath !== undefined &&
      isSupportedAnalysisPath(file.previousPath))
  );
}

function isSupportedAnalysisPath(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  return normalized.endsWith(".fcg") || normalized.endsWith(".csv");
}

function deduplicateChangedFiles(files: ChangedFile[]): ChangedFile[] {
  const deduplicated = new Map<string, ChangedFile>();
  for (const file of files) {
    deduplicated.set(file.relativePath, file);
  }
  return [...deduplicated.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^"|"$/g, "");
}
