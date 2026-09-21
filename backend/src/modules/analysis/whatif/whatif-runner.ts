/**
 * What-if evaluation: exact single-cell edits + freeform hypothetical questions.
 *
 * Responsibility: validate the repository path, then either
 * - exact mode (filePath/keyValue/column/newValue): read the file from the
 *   worktree (or base revision fallback), apply the edit in memory, run
 *   deterministic pre-checks, and optionally ask the AI workflow, or
 * - question mode (question): score CSV candidates against the question
 *   keywords, attach the best matches, and ask the AI prompter for a cited
 *   prose answer. When the AI resolves the question to exactly one cell,
 *   the edit is grounded with the same deterministic pre-checks.
 * Never writes to the repository. Called by AnalysisService; no HTTP
 * concerns here.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { z } from "zod";

import type { AppConfig } from "../../../config/env.js";
import { AppError } from "../../../shared/errors.js";
import { getLogger } from "../../../shared/logger.js";
import type { InseaWorkflowClient } from "../../ai/insea.client.js";
import type { WorkflowFile } from "../../ai/context-builder.js";
import { buildWhatIfAskPrompt, buildWhatIfPrompt } from "../../ai/prompt.builder.js";
import { normalizeAiReport } from "../../ai/report-normalizer.js";
import type { Finding, WhatIfResult } from "../analysis-run.entity.js";
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
  filePath?: string;
  keyColumn?: string;
  keyValue?: string;
  column?: string;
  newValue?: string;
  goal?: string;
  question?: string;
  history?: Array<{ question: string; answer: string }>;
}

const MAX_ASK_FILES = 4;
const MAX_ASK_TOTAL_BYTES = 200_000;

const askAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8000),
  citations: z.array(z.string().trim().min(1).max(1024)).optional().default([]),
  resolvedEdit: z
    .object({
      filePath: z.string().trim().min(1).max(1024),
      keyColumn: z.string().trim().min(1).max(255).optional(),
      keyValue: z.string().trim().min(1).max(1024),
      column: z.string().trim().min(1).max(255),
      newValue: z.string().trim().max(4096),
    })
    .nullable()
    .optional(),
});

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "what",
  "would",
  "could",
  "should",
  "does",
  "this",
  "that",
  "have",
  "has",
  "had",
  "are",
  "was",
  "were",
  "will",
  "than",
  "then",
  "there",
  "here",
  "about",
  "your",
  "our",
  "better",
  "experience",
  "player",
  "game",
]);

export async function runWhatIfAnalysis(
  deps: RunWhatIfDeps,
  input: RunWhatIfInput,
): Promise<WhatIfResult> {
  const question = input.question?.trim() ?? "";
  if (question.length > 0) {
    return runQuestionWhatIf(deps, input, question);
  }
  if (
    input.filePath !== undefined &&
    input.keyValue !== undefined &&
    input.column !== undefined &&
    input.newValue !== undefined
  ) {
    return runExactWhatIf(deps, {
      localPath: input.localPath,
      baseRef: input.baseRef,
      filePath: input.filePath,
      keyColumn: input.keyColumn,
      keyValue: input.keyValue,
      column: input.column,
      newValue: input.newValue,
      goal: input.goal ?? question,
    });
  }
  throw new AppError(
    "VALIDATION_ERROR",
    400,
    "Ask a question or provide an exact edit (filePath, keyValue, column, newValue).",
  );
}

interface ExactWhatIfInput {
  localPath: string;
  baseRef: string;
  filePath: string;
  keyColumn?: string;
  keyValue: string;
  column: string;
  newValue: string;
  goal?: string;
}

async function runExactWhatIf(
  deps: RunWhatIfDeps,
  input: ExactWhatIfInput,
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

/** Deterministic grounding for one resolved cell — no AI call, audit only. */
async function groundResolvedEdit(
  root: string,
  baseRef: string,
  edit: { filePath: string; keyColumn?: string; keyValue: string; column: string; newValue: string },
): Promise<{ filePath: string; keyColumn: string; oldValue: string; findings: Finding[] } | null> {
  const normalized = normalize(edit.filePath.replace(/\\/g, "/")).replace(/^\.\//, "");
  if (normalized === "" || normalized === "." || normalized.startsWith("..")) return null;
  const absolute = join(root, normalized);
  if (!normalize(absolute).startsWith(normalize(root))) return null;
  let content: string | null = null;
  try {
    content = await readFile(absolute, "utf8");
  } catch {
    content = null;
  }
  if (content === null && baseRef !== "WORKTREE") {
    try {
      const commit = await sharedGitClient.resolveCommit(root, baseRef);
      content = await sharedGitClient.showRevisionFile(root, commit, normalized);
    } catch {
      content = null;
    }
  }
  if (content === null) return null;
  const rows = parseCsvContent(content);
  const header = rows[0] ?? [];
  const dataRows = rows.slice(2);
  const columnIndex = header.indexOf(edit.column);
  if (columnIndex === -1) return null;
  let keyColumn = edit.keyColumn?.trim() ?? "";
  if (keyColumn === "") keyColumn = inferKeyColumns(header, dataRows)[0] ?? "";
  if (keyColumn === "" || !header.includes(keyColumn)) return null;
  const keyIndex = header.indexOf(keyColumn);
  const target = dataRows.find((row) => (row[keyIndex] ?? "") === edit.keyValue);
  if (target === undefined) return null;
  const oldValue = target[columnIndex] ?? "";
  target[columnIndex] = edit.newValue;
  const edited = rows.map(serializeCsvRow).join("\n");
  const editedHeader = parseCsvContent(edited)[0] ?? [];
  const editedData = parseCsvContent(edited).slice(2);
  const audit = auditCsvContent(edited, {
    filePath: normalized,
    keyColumns: inferKeyColumns(editedHeader, editedData),
  });
  return { filePath: normalized, keyColumn, oldValue, findings: audit.findings };
}

function tokenizeQuestion(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

interface CandidateFile {
  relativePath: string;
  content: string;
  sizeBytes: number;
  sha256: string;
  snippet: string;
  worktreePath?: string;
}

async function collectAskCandidates(
  root: string,
  baseRef: string,
  csvPaths: string[],
  keywords: string[],
): Promise<CandidateFile[]> {
  const fromWorktree = baseRef === "WORKTREE";
  const commit = fromWorktree
    ? null
    : await sharedGitClient.resolveCommit(root, baseRef).catch(() => null);
  const scored: Array<{ path: string; content: string; score: number }> = [];
  for (const relativePath of csvPaths) {
    let content: string | null = null;
    if (fromWorktree) {
      content = await readFile(join(root, relativePath), "utf8").catch(() => null);
    } else if (commit !== null) {
      content = await sharedGitClient
        .showRevisionFile(root, commit, relativePath)
        .catch(() => null);
    }
    if (content === null || content.length === 0) continue;
    const lower = content.toLowerCase();
    const nameLower = relativePath.toLowerCase();
    let score = 0;
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) score += 3;
      if (lower.includes(keyword)) score += 1;
    }
    scored.push({ path: relativePath, content, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const picked = scored.slice(0, MAX_ASK_FILES);
  // When nothing matches, still attach the first CSVs so the model sees real evidence.
  const candidates: CandidateFile[] = [];
  let totalBytes = 0;
  for (const entry of picked) {
    const sizeBytes = Buffer.byteLength(entry.content, "utf8");
    if (totalBytes + sizeBytes > MAX_ASK_TOTAL_BYTES) continue;
    totalBytes += sizeBytes;
    const lines = entry.content.split("\n");
    const lower = entry.content.toLowerCase();
    const matched = lines.filter((line) => {
      const lineLower = line.toLowerCase();
      return keywords.some((keyword) => lineLower.includes(keyword));
    });
    const snippetLines = (matched.length > 0 ? matched : lines).slice(0, 30);
    candidates.push({
      relativePath: entry.path,
      content: entry.content,
      sizeBytes,
      sha256: createHash("sha256").update(entry.content, "utf8").digest("hex"),
      snippet: snippetLines.join("\n"),
      ...(fromWorktree ? { worktreePath: join(root, entry.path) } : {}),
    });
    void lower;
  }
  return candidates;
}

async function runQuestionWhatIf(
  deps: RunWhatIfDeps,
  input: RunWhatIfInput,
  question: string,
): Promise<WhatIfResult> {
  const inspection = await inspectLocalProject(input.localPath, {
    allowedRoots: deps.config.analyzedRoots,
  });
  const root = inspection.rootPath;
  const csvPaths = inspection.files
    .map((file) => file.relativePath)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort();
  const keywords = tokenizeQuestion(question);
  const candidates = await collectAskCandidates(root, input.baseRef, csvPaths, keywords);
  const bestPath = candidates[0]?.relativePath ?? "";

  if (deps.aiClient === null || deps.config.ai.configured === false) {
    return {
      filePath: bestPath,
      baseRef: input.baseRef,
      keyColumn: "",
      keyValue: "",
      column: "",
      oldValue: "",
      newValue: "",
      findings: [],
      aiStatus: "not_configured",
      error:
        "The AI workflow is not configured; connect it to get a cited answer. Exact single-cell edits still work without AI.",
    };
  }

  const hints: string[] = [];
  if (input.filePath) hints.push(`file=${input.filePath}`);
  if (input.column) hints.push(`column=${input.column}`);
  if (input.newValue) hints.push(`newValue=${input.newValue}`);
  if (input.keyValue) hints.push(`keyValue=${input.keyValue}`);
  if (input.keyColumn) hints.push(`keyColumn=${input.keyColumn}`);

  const prompt = buildWhatIfAskPrompt({
    question,
    history: (input.history ?? []).map((entry) => ({
      question: entry.question,
      answer: entry.answer,
    })),
    candidateFiles: candidates.map((candidate) => ({
      relativePath: candidate.relativePath,
      snippet: candidate.snippet,
    })),
    ...(hints.length > 0 ? { hints: hints.join(" ") } : {}),
  });

  const requestId = randomUUID();
  const files: WorkflowFile[] = [];
  const attachments: Array<Record<string, unknown>> = [];
  const tempPaths: string[] = [];
  try {
    let index = 0;
    for (const candidate of candidates) {
      index += 1;
      const uploadName = `whatif-ask-${String(index).padStart(4, "0")}.csv`;
      let absolutePath: string;
      if (candidate.worktreePath !== undefined) {
        absolutePath = candidate.worktreePath;
      } else {
        const tempPath = join(tmpdir(), `whatif-ask-${requestId}-${index}.csv`);
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
        id: `whatif-ask-file-${index}`,
        upload_name: uploadName,
        relative_path: candidate.relativePath,
        revision: input.baseRef,
        kind: "config",
        content_type: "text/csv",
        size_bytes: candidate.sizeBytes,
        sha256: candidate.sha256,
      });
    }
    // Insea requires a non-empty DataList: fall back to a digest file when
    // the project has no CSV candidates at all.
    if (files.length === 0) {
      const digest = [
        `Question: ${question}`,
        `Base ref: ${input.baseRef}`,
        `CSV files in project: ${csvPaths.length}`,
        ...csvPaths.slice(0, 60),
      ].join("\n");
      const digestPath = join(tmpdir(), `whatif-ask-${requestId}.txt`);
      await writeFile(digestPath, digest, "utf8");
      tempPaths.push(digestPath);
      const digestBytes = Buffer.byteLength(digest, "utf8");
      const digestSha = createHash("sha256").update(digest, "utf8").digest("hex");
      files.push({
        absolutePath: digestPath,
        uploadName: "whatif-context.txt",
        contentType: "text/plain",
        sha256: digestSha,
        sizeBytes: digestBytes,
      });
      attachments.push({
        id: "whatif-ask-file-1",
        upload_name: "whatif-context.txt",
        relative_path: "(generated file list)",
        revision: input.baseRef,
        kind: "digest",
        content_type: "text/plain",
        size_bytes: digestBytes,
        sha256: digestSha,
      });
    }
    const raw = await deps.aiClient.run({
      prompt,
      manifest: {
        schema_version: "1.0",
        request_id: requestId,
        stage: "followup_qa",
        mode: "whatif-ask",
        base_ref: input.baseRef,
        question,
        attachments,
      },
      files,
      requestId,
    });
    const parsed = askAnswerSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(
        "AI_PROTOCOL_ERROR",
        502,
        "The AI answer was not valid what-if JSON.",
      );
    }
    const { answer, citations } = parsed.data;
    const resolved = parsed.data.resolvedEdit ?? null;
    if (resolved !== null) {
      const grounded = await groundResolvedEdit(root, input.baseRef, {
        filePath: resolved.filePath,
        ...(resolved.keyColumn !== undefined ? { keyColumn: resolved.keyColumn } : {}),
        keyValue: resolved.keyValue,
        column: resolved.column,
        newValue: resolved.newValue,
      });
      if (grounded !== null) {
        return {
          filePath: grounded.filePath,
          baseRef: input.baseRef,
          keyColumn: grounded.keyColumn,
          keyValue: resolved.keyValue,
          column: resolved.column,
          oldValue: grounded.oldValue,
          newValue: resolved.newValue,
          findings: grounded.findings,
          answer,
          citations: citations.slice(0, 20),
          aiStatus: "completed",
        };
      }
    }
    return {
      filePath: bestPath,
      baseRef: input.baseRef,
      keyColumn: "",
      keyValue: "",
      column: "",
      oldValue: "",
      newValue: "",
      findings: [],
      answer,
      citations: citations.slice(0, 20),
      aiStatus: "completed",
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    getLogger().warn({ err: error }, "what-if ask failed");
    return {
      filePath: bestPath,
      baseRef: input.baseRef,
      keyColumn: "",
      keyValue: "",
      column: "",
      oldValue: "",
      newValue: "",
      findings: [],
      aiStatus: "failed",
      error: "The AI workflow did not answer the question.",
    };
  } finally {
    await Promise.allSettled(tempPaths.map((path) => unlink(path).catch(() => undefined)));
  }
}
