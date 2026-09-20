import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitRepositoryState {
  rootPath: string;
  branch: string;
  headCommit: string;
  hasUncommittedChanges: boolean;
}

export class GitInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitInspectionError";
  }
}

export async function inspectGitRepository(
  candidatePath: string
): Promise<GitRepositoryState> {
  try {
    const rootPath = await runGit(candidatePath, [
      "rev-parse",
      "--show-toplevel"
    ]);
    const branch =
      (await runGit(rootPath, ["branch", "--show-current"])) || "DETACHED_HEAD";
    const headCommit = await runGit(rootPath, ["rev-parse", "HEAD"]);
    const status = await runGit(rootPath, ["status", "--porcelain"]);

    return {
      rootPath,
      branch,
      headCommit,
      hasUncommittedChanges: status.length > 0
    };
  } catch (error) {
    throw new GitInspectionError(
      `Unable to inspect Git repository at "${candidatePath}": ${toErrorMessage(error)}`
    );
  }
}

async function runGit(workingDirectory: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: workingDirectory,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  return result.stdout.trim();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
