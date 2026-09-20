/**
 * Localization check runner (I/O + optional AI narrative).
 *
 * Responsibility: collect localization CSVs from the worktree or a base
 * revision, run the deterministic checker, and optionally ask the AI
 * workflow (localization lens) for the designer-facing narrative. Files
 * from other revisions travel as temp attachments and are always cleaned
 * up. Called by AnalysisService; no HTTP concerns here.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../../config/env.js";
import { getLogger } from "../../shared/logger.js";
import type { InseaWorkflowClient } from "../ai/insea.client.js";
import type { WorkflowFile } from "../ai/context-builder.js";
import { buildPrompt } from "../ai/prompt.builder.js";
import { normalizeAiReport } from "../ai/report-normalizer.js";
import type { AiStatus, Finding } from "../analysis/analysis-run.entity.js";
import { sharedGitClient } from "../git/git-client.js";
import { inspectLocalProject } from "../projects/project.service.js";
import {
  checkLocalizationFiles,
  isLocalizationFile,
} from "./localization-checker.js";

export interface RunLocalizationDeps {
  config: AppConfig;
  aiClient: InseaWorkflowClient | null;
}

export interface RunLocalizationInput {
  localPath: string;
  baseRef: string;
  goal?: string;
}

export interface LocalizationCheckOutput {
  baseRef: string;
  filesChecked: string[];
  findings: Finding[];
  aiReport?: Record<string, unknown>;
  aiStatus: AiStatus;
  error?: string;
}

const MAX_LOC_FILES = 10;
const MAX_LOC_TOTAL_BYTES = 500_000;

export async function runLocalizationCheck(
  deps: RunLocalizationDeps,
  input: RunLocalizationInput,
): Promise<LocalizationCheckOutput> {
  const inspection = await inspectLocalProject(input.localPath, {
    allowedRoots: deps.config.analyzedRoots,
  });
  const fromWorktree = input.baseRef === "WORKTREE";
  const commit = fromWorktree
    ? null
    : await sharedGitClient.resolveCommit(inspection.rootPath, input.baseRef);

  const candidates = await collectCandidates(
    inspection.rootPath,
    inspection.files.map((file) => ({
      relativePath: file.relativePath,
      absolutePath: file.absolutePath,
    })),
    fromWorktree,
    commit,
  );
  const { aiReport, aiStatus, error } =
    deps.aiClient === null || deps.config.ai.configured === false
      ? { aiReport: undefined, aiStatus: "not_configured" as const, error: undefined }
      : await runLocalizationAi(deps, inspection.rootPath, input, candidates);

  const checked = checkLocalizationFiles(
    candidates.map((candidate) => ({
      relativePath: candidate.relativePath,
      content: candidate.content,
    })),
  );
  return {
    baseRef: input.baseRef,
    filesChecked: checked.filesChecked,
    findings: checked.findings,
    ...(aiReport !== undefined ? { aiReport } : {}),
    aiStatus,
    ...(error !== undefined ? { error } : {}),
  };
}

interface LocCandidate {
  relativePath: string;
  content: string;
  sizeBytes: number;
  sha256: string;
  tempPath?: string;
}

async function collectCandidates(
  root: string,
  files: Array<{ relativePath: string; absolutePath: string }>,
  fromWorktree: boolean,
  commit: string | null,
): Promise<LocCandidate[]> {
  const names = fromWorktree
    ? files
        .filter(
          (file) =>
            file.relativePath.toLowerCase().endsWith(".csv") &&
            isLocalizationFile(file.relativePath),
        )
        .map((file) => file.relativePath)
    : (await sharedGitClient.listRevisionFiles(root, commit!))
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (name) => name.toLowerCase().endsWith(".csv") && isLocalizationFile(name),
        );
  const candidates: LocCandidate[] = [];
  let totalBytes = 0;
  for (const name of names.slice(0, MAX_LOC_FILES)) {
    const content = fromWorktree
      ? await readFile(join(root, name), "utf8").catch(() => null)
      : await sharedGitClient.showRevisionFile(root, commit!, name).catch(() => null);
    if (content === null) continue;
    const sizeBytes = Buffer.byteLength(content, "utf8");
    if (totalBytes + sizeBytes > MAX_LOC_TOTAL_BYTES) continue;
    totalBytes += sizeBytes;
    candidates.push({
      relativePath: name,
      content,
      sizeBytes,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    });
  }
  return candidates;
}

async function runLocalizationAi(
  deps: RunLocalizationDeps,
  root: string,
  input: RunLocalizationInput,
  candidates: LocCandidate[],
): Promise<{
  aiReport?: Record<string, unknown>;
  aiStatus: AiStatus;
  error?: string;
}> {
  const prompt = buildPrompt({
    goal:
      input.goal ??
      "Audit the localization tables for key coverage, row integrity, and empty values.",
    lens: "localization",
    verbosity: "short",
  });
  const requestId = randomUUID();
  const files: WorkflowFile[] = [];
  const attachments: Array<Record<string, unknown>> = [];
  const tempPaths: string[] = [];
  try {
    let index = 0;
    for (const candidate of candidates) {
      index += 1;
      const uploadName = `loc-${String(index).padStart(4, "0")}.csv`;
      let absolutePath: string;
      if (input.baseRef === "WORKTREE") {
        absolutePath = join(root, candidate.relativePath);
      } else {
        const tempPath = join(tmpdir(), `loc-${requestId}-${index}.csv`);
        await writeFile(tempPath, candidate.content, "utf8");
        tempPaths.push(tempPath);
        absolutePath = tempPath;
      }
      files.push({
        absolutePath,
        uploadName,
        contentType: "text/csv",
        sha256: candidate.sha256,
        sizeBytes: candidate.sizeBytes,
      });
      attachments.push({
        id: `loc-file-${index}`,
        upload_name: uploadName,
        relative_path: candidate.relativePath,
        revision: input.baseRef,
        kind: "config",
        content_type: "text/csv",
        size_bytes: candidate.sizeBytes,
        sha256: candidate.sha256,
      });
    }
    const aiReport = normalizeAiReport(
      await deps.aiClient!.run({
        prompt,
        manifest: {
          schema_version: "1.0",
          request_id: requestId,
          stage: "impact_analysis",
          mode: "localization",
          base_ref: input.baseRef,
          attachments,
        },
        files,
        requestId,
      }),
    );
    return { aiReport, aiStatus: "completed" };
  } catch (error) {
    getLogger().warn({ err: error }, "localization AI stage failed");
    return {
      aiStatus: "failed",
      error: "The AI workflow did not answer; deterministic findings above still apply.",
    };
  } finally {
    await Promise.allSettled(tempPaths.map((path) => unlink(path).catch(() => undefined)));
  }
}
