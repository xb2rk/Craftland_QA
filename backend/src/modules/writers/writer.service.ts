/**
 * Commit-message and PR-description drafting.
 *
 * Responsibility: gather the base→current digest (changed files, commit
 * subjects, diff excerpt) and produce copy-pasteable text. Without AI the
 * deterministic template still answers; with a failing AI the template is
 * returned alongside the error. Never queues a run — writers are instant.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import type { AppConfig } from "../../config/env.js";
import type { WorkflowFile } from "../ai/context-builder.js";
import { getLogger } from "../../shared/logger.js";
import {
  buildWriterPrompt,
  type WriterDigestFile,
  type WriterKind,
} from "../ai/prompts/writer.prompt.js";
import type { InseaWorkflowClient } from "../ai/insea.client.js";
import type { AiStatus } from "../analysis/analysis-run.entity.js";
import { compareGitRevisions } from "../git/git-comparison.js";
import { sharedGitClient } from "../git/git-client.js";
import { inspectLocalProject } from "../projects/project.service.js";

export type { WriterKind };

export interface DraftWriterDeps {
  config: AppConfig;
  aiClient: InseaWorkflowClient | null;
}

export interface DraftWriterInput {
  localPath: string;
  baseRef: string;
  currentRef: string;
  kind: WriterKind;
  goal?: string;
  /** Per-project author instructions, obeyed by the AI draft. */
  instructions?: string;
}

export interface WriterDraft {
  kind: WriterKind;
  text: string;
  aiStatus: AiStatus;
  /** Convention files discovered in the target repo and fed to the prompt. */
  conventions: string[];
  error?: string;
}

const writerAnswerSchema = z.object({
  text: z.string().trim().min(1).max(12000),
});

const MAX_DIGEST_FILES = 80;
const MAX_DIFF_EXCERPT = 12000;

export async function draftWriterOutput(
  deps: DraftWriterDeps,
  input: DraftWriterInput,
): Promise<WriterDraft> {
  const inspection = await inspectLocalProject(input.localPath, {
    allowedRoots: deps.config.analyzedRoots,
  });
  const comparison = await compareGitRevisions(
    inspection.rootPath,
    input.baseRef,
    input.currentRef,
  );
  const files: WriterDigestFile[] = comparison.changedFiles
    .slice(0, MAX_DIGEST_FILES)
    .map((file) => ({
      relativePath: file.relativePath,
      changeType: file.changeType,
    }));
  const subjects = await readCommitSubjects(
    inspection.rootPath,
    comparison.baseCommit,
    comparison.currentCommit,
  );
  const conventions = await readRepoConventions(inspection.rootPath);
  const template = deterministicWriterText(
    input.kind,
    input.baseRef,
    input.currentRef,
    files,
    subjects,
  );

  if (deps.aiClient === null || deps.config.ai.configured === false) {
    return {
      kind: input.kind,
      text: template,
      aiStatus: "not_configured",
      conventions: conventions.map((entry) => entry.source),
    };
  }
  try {
    const prompt = buildWriterPrompt({
      kind: input.kind,
      baseRef: input.baseRef,
      currentRef: input.currentRef,
      changedFiles: files,
      commitSubjects: subjects,
      diffExcerpt: (comparison.unifiedDiff ?? "").slice(0, MAX_DIFF_EXCERPT),
      goal: input.goal,
      conventions:
        conventions.length > 0
          ? conventions
              .map((entry) => `--- ${entry.source} ---\n${entry.excerpt}`)
              .join("\n")
          : undefined,
      instructions: input.instructions,
    });
    const requestId = randomUUID();
    // Insea requires a non-empty DataList: attach the diff excerpt the draft
    // is based on as the evidence file.
    const diffBody = (comparison.unifiedDiff ?? "").slice(0, MAX_DIFF_EXCERPT);
    const evidenceBody = diffBody.length > 0 ? diffBody : template;
    const evidencePath = join(tmpdir(), `writer-${requestId}.txt`);
    await writeFile(evidencePath, evidenceBody, "utf8");
    const evidenceBytes = Buffer.byteLength(evidenceBody, "utf8");
    const evidenceSha = createHash("sha256").update(evidenceBody, "utf8").digest("hex");
    const evidenceFile: WorkflowFile = {
      absolutePath: evidencePath,
      uploadName: "writer-diff.txt",
      contentType: "text/plain",
      sha256: evidenceSha,
      sizeBytes: evidenceBytes,
    };
    try {
      const raw = await deps.aiClient.run({
        prompt,
        manifest: {
          schema_version: "1.0",
          request_id: requestId,
          stage: "writer",
          kind: input.kind,
          base_ref: input.baseRef,
          current_ref: input.currentRef,
          attachments: [
            {
              id: "writer-file-1",
              upload_name: evidenceFile.uploadName,
              relative_path: "(generated diff excerpt)",
              revision: input.currentRef,
              kind: "diff",
              content_type: evidenceFile.contentType,
              size_bytes: evidenceBytes,
              sha256: evidenceSha,
            },
          ],
        },
        files: [evidenceFile],
        requestId,
      });
      const parsed = writerAnswerSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Writer answer was not valid JSON.");
      }
      return {
        kind: input.kind,
        text: parsed.data.text,
        aiStatus: "completed",
        conventions: conventions.map((entry) => entry.source),
      };
    } finally {
      await unlink(evidencePath).catch(() => undefined);
    }
  } catch (error) {
    getLogger().warn({ err: error }, "writer AI stage failed, returning template");
    return {
      kind: input.kind,
      text: template,
      aiStatus: "failed",
      conventions: conventions.map((entry) => entry.source),
      error: "The AI workflow did not answer; a template draft is returned instead.",
    };
  }
}

export interface RepoConvention {
  source: string;
  excerpt: string;
}

const CONVENTION_FILES = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  ".github/pull_request_template.md",
];

const MAX_CONVENTION_CHARS = 4000;

/**
 * Read team conventions from the target repo worktree when present. Missing
 * files are skipped silently — most repos have none of these.
 */
export async function readRepoConventions(root: string): Promise<RepoConvention[]> {
  const found: RepoConvention[] = [];
  for (const source of CONVENTION_FILES) {
    const content = await readFile(join(root, source), "utf8").catch(
      () => null,
    );
    if (content === null || content.trim().length === 0) continue;
    found.push({ source, excerpt: content.slice(0, MAX_CONVENTION_CHARS) });
  }
  return found;
}

async function readCommitSubjects(
  root: string,
  baseCommit: string,
  currentCommit: string,
): Promise<string[]> {
  if (baseCommit === currentCommit) return [];
  try {
    const raw = await sharedGitClient.run(root, [
      "log",
      `${baseCommit}..${currentCommit}`,
      "-n20",
      "--format=%s",
    ]);
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Deterministic fallback: honest file-list prose. Used with AI off and as
 * the safety net when the workflow fails, so the button always answers.
 */
export function deterministicWriterText(
  kind: WriterKind,
  baseRef: string,
  currentRef: string,
  files: WriterDigestFile[],
  subjects: string[],
): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.changeType, (counts.get(file.changeType) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .map(([change, count]) => `${count} ${change}`)
    .join(", ");
  const topDirs = topDirectories(files);
  const scope = topDirs.length === 1 ? topDirs[0] : null;
  if (kind === "commit") {
    const type = counts.has("added") && !counts.has("modified") ? "feat" : "chore";
    const subject = `${type}${scope ? `(${scope})` : ""}: update ${files.length} file${files.length === 1 ? "" : "s"} (${baseRef}...${currentRef})`;
    const bullets = files
      .slice(0, 5)
      .map((file) => `- ${file.changeType}: ${file.relativePath}`);
    return [subject, "", ...(summary.length > 0 ? [`${summary}.`] : []), ...bullets].join("\n");
  }
  const lines = [
    "## Summary",
    "",
    `Change ${baseRef} → ${currentRef}: ${files.length} file${files.length === 1 ? "" : "s"}${summary.length > 0 ? ` (${summary})` : ""}.`,
    "",
    "## Changes",
    "",
    ...files.slice(0, 20).map((file) => `- ${file.changeType}: \`${file.relativePath}\``),
  ];
  if (subjects.length > 0) {
    lines.push("", "## Commits", "", ...subjects.map((subject) => `- ${subject}`));
  }
  lines.push("", "## Test plan", "", "1. Review the diff file by file.", "2. Run the affected game flows.", "3. Verify no new deterministic findings appear on re-review.");
  return lines.join("\n");
}

function topDirectories(files: WriterDigestFile[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const dir = file.relativePath.split("/").slice(0, -1).join("/") || ".";
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dir]) => dir);
}
