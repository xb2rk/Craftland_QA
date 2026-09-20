import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { GitError } from "../../shared/errors.js";

const execFileAsync = promisify(execFile);

export interface GitRunOptions {
  maxBufferBytes?: number;
  timeoutMs?: number;
  allowEmpty?: boolean;
}

export class GitClient {
  async run(
    workingDirectory: string,
    args: string[],
    options: GitRunOptions = {},
  ): Promise<string> {
    try {
      const result = await execFileAsync("git", args, {
        cwd: workingDirectory,
        windowsHide: true,
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: options.maxBufferBytes ?? 20 * 1024 * 1024,
      });
      const output = result.stdout.trim();
      if (!options.allowEmpty && output.length === 0 && args[0] !== "status" && args[0] !== "diff") {
        // rev-parse and similar must produce output; empty means bad ref.
      }
      return output;
    } catch (error) {
      throw new GitError(
        `Git command failed: git ${args[0] ?? ""}. Check the repository and refs.`,
      );
    }
  }

  resolveCommit(repositoryRoot: string, ref: string): Promise<string> {
    return this.run(repositoryRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
  }

  showRevisionFile(repositoryRoot: string, revision: string, relativePath: string): Promise<string> {
    return this.run(repositoryRoot, ["show", `${revision}:${relativePath}`]);
  }

  listRevisionFiles(repositoryRoot: string, revision: string): Promise<string> {
    return this.run(repositoryRoot, ["ls-tree", "-r", "--name-only", revision]);
  }
}

export const sharedGitClient = new GitClient();
