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

  listBranches(repositoryRoot: string): Promise<string> {
    return this.run(repositoryRoot, [
      "for-each-ref",
      "--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)",
      "refs/heads",
    ]);
  }

  listCommits(
    repositoryRoot: string,
    options: { search?: string; limit?: number } = {},
  ): Promise<string> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const args = [
      "log",
      `-n${limit}`,
      "--format=%H%x00%h%x00%an%x00%ad%x00%s",
      "--date=short",
    ];
    const search = options.search?.trim();
    if (search) {
      if (/^[0-9a-f]{4,40}$/i.test(search)) {
        args.push(search);
      } else {
        args.push("--grep", search, "--regexp-ignore-case");
      }
    }
    return this.run(repositoryRoot, args);
  }
}

export const sharedGitClient = new GitClient();
