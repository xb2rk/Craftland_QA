/**
 * What-if evaluation for a hypothetical single-cell config edit.
 *
 * Responsibility: validate the repository path, read the file from the
 * worktree (or base revision fallback), apply the edit in memory, run
 * deterministic pre-checks, and optionally ask the AI workflow. Never
 * writes to the repository — the edited content only travels as an AI
 * attachment. Called by AnalysisService; no HTTP concerns here.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";

import type { AppConfig } from "../../../config/env.js";
import { AppError } from "../../../shared/errors.js";
import { getLogger } from "../../../shared/logger.js";
import type { InseaWorkflowClient } from "../../ai/insea.client.js";
import { buildWhatIfPrompt } from "../../ai/prompt.builder.js";
import { normalizeAiReport } from "../../ai/report-normalizer.js";
import type { WhatIfResult } from "../analysis-run.entity.js";
import type { AnalysisRunRepository } from "../../../persistence/repository.js";
import { sharedGitClient } from "../../git/git-client.js";
import { inspectLocalProject } from "../../projects/project.service.js";
import { auditCsvContent } from "../../configs/csv.auditor.js";
import { inferKeyColumns } from "../../configs/config-comparator.js";
import { parseCsvContent } from "../../configs/csv.parser.js";
import { serializeCsvRow } from "../../configs/csv.utils.js";

export interface RunWhatIfDeps {
  repository: AnalysisRunRepository;
  config: AppConfig;
  aiClient: InseaWorkflowClient | null;
}

export interface RunWhatIfInput {
  localPath: string;
  baseRef: string;
  filePath: string;
  keyColumn?: string;
  keyValue: string;
  column: string;
  newValue: string;
  goal?: string;
}

export async function runWhatIfAnalysis(
  deps: RunWhatIfDeps,
  input: RunWhatIfInput,
): Promise<WhatIfResult> {
  const inspection = await inspectLocalProject(input.localPath, {
    allowedRoots: deps.config.analyzedRoots,
  });
  const root = inspection.rootPath;
  const normalized = normalize(input.filePath.replace(/\\/g, "/")).replace(
    /^\.\//,
    "",
  );
  if (normalized === "" || normalized === "." || normalized.startsWith("..")) {
    throw new AppError("VALIDATION_ERROR", 400, "File path escapes the repository.");
  }
  const absolute = join(root, normalized);
  if (!normalize(absolute).startsWith(normalize(root))) {
    throw new AppError("VALIDATION_ERROR", 400, "File path escapes the repository.");
  }
  let content: string | null = null;
  try {
    content = await readFile(absolute, "utf8");
  } catch {
    content = null;
  }
  if (content === null && input.baseRef !== "WORKTREE") {
    try {
      const commit = await sharedGitClient.resolveCommit(root, input.baseRef);
      content = await sharedGitClient.showRevisionFile(root, commit, normalized);
    } catch {
      content = null;
    }
  }
  if (content === null) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "File was not found in the worktree or the base revision.",
    );
  }
  const rows = parseCsvContent(content);
  const header = rows[0] ?? [];
  const dataRows = rows.slice(2);
  const columnIndex = header.indexOf(input.column);
  if (columnIndex === -1) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `Column "${input.column}" does not exist in ${normalized}.`,
    );
  }
  let keyColumn = input.keyColumn?.trim() ?? "";
  if (keyColumn === "") {
    keyColumn = inferKeyColumns(header, dataRows)[0] ?? "";
  }
  if (keyColumn === "" || !header.includes(keyColumn)) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "No key column found; pass keyColumn explicitly.",
    );
  }
  const keyIndex = header.indexOf(keyColumn);
  const target = dataRows.find((row) => (row[keyIndex] ?? "") === input.keyValue);
  if (target === undefined) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `No row with ${keyColumn} = ${input.keyValue} in ${normalized}.`,
    );
  }
  const oldValue = target[columnIndex] ?? "";
  target[columnIndex] = input.newValue;
  const edited = rows.map(serializeCsvRow).join("\n");
  const editedHeader = parseCsvContent(edited)[0] ?? [];
  const editedData = parseCsvContent(edited).slice(2);
  const audit = auditCsvContent(edited, {
    filePath: normalized,
    keyColumns: inferKeyColumns(editedHeader, editedData),
  });
  const auditNotes = [
    `Edited row (${keyColumn}=${input.keyValue}): ${serializeCsvRow(target)}`,
    `Pre-checks: ${audit.findings.length} finding(s): ${audit.findings
      .slice(0, 10)
      .map((finding) => `${finding.code}: ${finding.message}`)
      .join(" | ") || "none"}`,
  ].join("\n");

  if (deps.aiClient === null || deps.config.ai.configured === false) {
    return {
      filePath: normalized,
      baseRef: input.baseRef,
      keyColumn,
      keyValue: input.keyValue,
      column: input.column,
      oldValue,
      newValue: input.newValue,
      findings: audit.findings,
      aiStatus: "not_configured",
    };
  }
  // Insea requires a non-empty DataList: attach the edited file content.
  const whatIfBytes = Buffer.byteLength(edited, "utf8");
  const whatIfSha = createHash("sha256").update(edited, "utf8").digest("hex");
  const whatIfTmp = join(tmpdir(), `whatif-${randomUUID()}.csv`);
  await writeFile(whatIfTmp, edited, "utf8");
  try {
    const prompt = buildWhatIfPrompt({
      filePath: normalized,
      keyColumn,
      keyValue: input.keyValue,
      column: input.column,
      oldValue,
      newValue: input.newValue,
      goal: input.goal,
      auditNotes,
    });
    const requestId = randomUUID();
    const aiReport = normalizeAiReport(
      await deps.aiClient.run({
        prompt,
        manifest: {
          schema_version: "1.0",
          request_id: requestId,
          stage: "impact_analysis",
          mode: "whatif",
          file_path: normalized,
          attachments: [
            {
              id: "whatif-file-1",
              upload_name: "whatif-edited.csv",
              relative_path: normalized,
              revision: "hypothetical",
              kind: "config",
              content_type: "text/csv",
              size_bytes: whatIfBytes,
              sha256: whatIfSha,
            },
          ],
        },
        files: [
          {
            absolutePath: whatIfTmp,
            uploadName: "whatif-edited.csv",
            contentType: "text/csv",
            sha256: whatIfSha,
            sizeBytes: whatIfBytes,
          },
        ],
        requestId,
      }),
    );
    return {
      filePath: normalized,
      baseRef: input.baseRef,
      keyColumn,
      keyValue: input.keyValue,
      column: input.column,
      oldValue,
      newValue: input.newValue,
      findings: audit.findings,
      aiReport,
      aiStatus: "completed",
    };
  } catch (error) {
    getLogger().warn({ err: error }, "what-if AI stage failed");
    return {
      filePath: normalized,
      baseRef: input.baseRef,
      keyColumn,
      keyValue: input.keyValue,
      column: input.column,
      oldValue,
      newValue: input.newValue,
      findings: audit.findings,
      aiStatus: "failed",
      error: "The AI workflow did not answer; deterministic pre-checks above still apply.",
    };
  } finally {
    await unlink(whatIfTmp).catch(() => undefined);
  }
}
