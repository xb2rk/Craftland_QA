/**
 * Localization check runner (I/O + optional AI narrative).
 *
 * Responsibility: resolve one localization table (or all of them), run the
 * deterministic checker, and optionally ask the AI workflow for a narrative
 * (check mode), cell translations (translate mode), or a QA answer (ask
 * mode). Revision files travel as temp attachments and are always cleaned
 * up. Called by AnalysisService; no HTTP concerns here.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import type { AppConfig } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { getLogger } from "../../shared/logger.js";
import type { InseaWorkflowClient } from "../ai/insea.client.js";
import type { WorkflowFile } from "../ai/context-builder.js";
import { buildPrompt } from "../ai/prompt.builder.js";
import {
  buildLocalizationAskPrompt,
  buildTranslatePrompt,
  type LocalizationTranslation,
} from "../ai/prompts/localization.prompt.js";
import { normalizeAiReport } from "../ai/report-normalizer.js";
import type { AiStatus, Finding } from "../analysis/analysis-run.entity.js";
import { sharedGitClient } from "../git/git-client.js";
import { inspectLocalProject } from "../projects/project.service.js";
import { parseCsvContent } from "../configs/csv.parser.js";
import { serializeCsvRow } from "../configs/csv.utils.js";
import {
  checkLocalizationFiles,
  isLocalizationFile,
  readLocalizationShape,
} from "./localization-checker.js";

export type { LocalizationTranslation };

export interface RunLocalizationDeps {
  config: AppConfig;
  aiClient: InseaWorkflowClient | null;
}

export type LocalizationMode = "check" | "translate";

export interface RunLocalizationInput {
  localPath: string;
  baseRef: string;
  goal?: string;
  /** Focus one table (basename or repo-relative path). Defaults to all tables. */
  filePath?: string;
  mode?: LocalizationMode;
  /** Translate scope: one language code/column, or one key. */
  language?: string;
  key?: string;
  /** Project term glossary, passed to the AI verbatim. */
  glossary?: string;
}

export interface LocalizationCheckOutput {
  baseRef: string;
  filesChecked: string[];
  /** Resolved table when filePath scoping picked exactly one file. */
  filePath?: string;
  languages: string[];
  findings: Finding[];
  translations?: LocalizationTranslation[];
  /** Full table with translations applied (translate mode). */
  translatedCsv?: string;
  aiReport?: Record<string, unknown>;
  aiStatus: AiStatus;
  error?: string;
}

export interface AskLocalizationInput {
  localPath: string;
  baseRef: string;
  filePath: string;
  question: string;
  history?: Array<{ question: string; answer: string }>;
  glossary?: string;
}

export interface LocalizationAnswer {
  filePath: string;
  answer: string;
  citations: string[];
  aiStatus: AiStatus;
  error?: string;
}

const MAX_LOC_FILES = 10;
const MAX_LOC_TOTAL_BYTES = 500_000;

const translateAnswerSchema = z.object({
  translations: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(255),
        language: z.string().trim().min(1).max(64),
        oldValue: z.string().max(4096),
        newValue: z.string().max(4096),
      }),
    )
    .max(2000),
});

const askAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8000),
  citations: z.array(z.string().trim().max(255)).default([]),
});

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
    input.filePath,
  );
  const checked = checkLocalizationFiles(
    candidates.map((candidate) => ({
      relativePath: candidate.relativePath,
      content: candidate.content,
    })),
  );
  const resolvedFile =
    candidates.length === 1 ? candidates[0]!.relativePath : undefined;

  const mode = input.mode ?? "check";
  if (
    mode === "translate" &&
    (deps.aiClient === null || deps.config.ai.configured === false)
  ) {
    return {
      baseRef: input.baseRef,
      filesChecked: checked.filesChecked,
      ...(resolvedFile !== undefined ? { filePath: resolvedFile } : {}),
      languages: checked.languages,
      findings: checked.findings,
      aiStatus: "not_configured",
      error: "Translate mode needs the AI workflow; deterministic findings above still apply.",
    };
  }

  const { aiReport, aiStatus, error, translations, translatedCsv } =
    deps.aiClient === null || deps.config.ai.configured === false
      ? {
          aiReport: undefined,
          aiStatus: "not_configured" as const,
          error: undefined,
          translations: undefined,
          translatedCsv: undefined,
        }
      : await runLocalizationAi(deps, inspection.rootPath, input, candidates);
  return {
    baseRef: input.baseRef,
    filesChecked: checked.filesChecked,
    ...(resolvedFile !== undefined ? { filePath: resolvedFile } : {}),
    languages: checked.languages,
    findings: checked.findings,
    ...(translations !== undefined ? { translations } : {}),
    ...(translatedCsv !== undefined ? { translatedCsv } : {}),
    ...(aiReport !== undefined ? { aiReport } : {}),
    aiStatus,
    ...(error !== undefined ? { error } : {}),
  };
}

/** Stateless QA answer over one table — no run is persisted. */
export async function askLocalizationQuestion(
  deps: RunLocalizationDeps,
  input: AskLocalizationInput,
): Promise<LocalizationAnswer> {
  if (deps.aiClient === null || deps.config.ai.configured === false) {
    throw new AppError(
      "AI_NOT_CONFIGURED",
      400,
      "The AI workflow is not configured; questions need it.",
    );
  }
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
    input.filePath,
  );
  if (candidates.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `No localization table matches "${input.filePath}".`,
    );
  }
  const candidate = candidates[0]!;
  const requestId = randomUUID();
  const tempPath = join(tmpdir(), `loc-ask-${requestId}.csv`);
  try {
    await writeFile(tempPath, candidate.content, "utf8");
    const prompt = buildLocalizationAskPrompt({
      filePath: candidate.relativePath,
      question: input.question,
      history: input.history ?? [],
      glossary: input.glossary,
    });
    const raw = await deps.aiClient.run({
      prompt,
      manifest: {
        schema_version: "1.0",
        request_id: requestId,
        stage: "followup_qa",
        mode: "localization-ask",
        base_ref: input.baseRef,
        attachments: [
          {
            id: "loc-file-1",
            upload_name: "loc-ask.csv",
            relative_path: candidate.relativePath,
            revision: input.baseRef,
            kind: "config",
            content_type: "text/csv",
            size_bytes: candidate.sizeBytes,
            sha256: candidate.sha256,
          },
        ],
      },
      files: [
        {
          absolutePath: tempPath,
          uploadName: "loc-ask.csv",
          contentType: "text/csv",
          sha256: candidate.sha256,
          sizeBytes: candidate.sizeBytes,
        },
      ],
      requestId,
    });
    const parsed = askAnswerSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Localization answer was not valid JSON.");
    }
    return {
      filePath: candidate.relativePath,
      answer: parsed.data.answer,
      citations: parsed.data.citations.slice(0, 20),
      aiStatus: "completed",
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    getLogger().warn({ err: error }, "localization ask failed");
    return {
      filePath: candidate.relativePath,
      answer: "",
      citations: [],
      aiStatus: "failed",
      error: "The AI workflow did not answer.",
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

interface LocCandidate {
  relativePath: string;
  content: string;
  sizeBytes: number;
  sha256: string;
  tempPath?: string;
}

/**
 * Craftland convention: the localization table is key.csv. When the caller
 * does not scope a file, check it first so one-table repos resolve to the
 * file the team expects.
 */
function preferKeyCsv(names: string[]): string[] {
  return [...names].sort((a, string_) => {
    const aKey = a.replace(/\\/g, "/").toLowerCase().endsWith("key.csv") ? 0 : 1;
    const bKey = string_.replace(/\\/g, "/").toLowerCase().endsWith("key.csv") ? 0 : 1;
    return aKey - bKey;
  });
}

async function collectCandidates(
  root: string,
  files: Array<{ relativePath: string; absolutePath: string }>,
  fromWorktree: boolean,
  commit: string | null,
  onlyFile?: string,
): Promise<LocCandidate[]> {
  const wanted = onlyFile?.replace(/\\/g, "/").toLowerCase();
  const matches = (name: string): boolean => {
    const normalized = name.replace(/\\/g, "/");
    if (!normalized.toLowerCase().endsWith(".csv")) return false;
    if (!isLocalizationFile(normalized)) return false;
    if (wanted === undefined) return true;
    const lower = normalized.toLowerCase();
    return (
      lower === wanted ||
      lower.endsWith(`/${wanted}`) ||
      lower.split("/").at(-1) === wanted.split("/").at(-1)
    );
  };
  const names = fromWorktree
    ? files.map((file) => file.relativePath).filter(matches)
    : (await sharedGitClient.listRevisionFiles(root, commit!))
        .split("\n")
        .map((line) => line.trim())
        .filter(matches);
  const limited = wanted !== undefined ? names.slice(0, 1) : preferKeyCsv(names).slice(0, MAX_LOC_FILES);
  const candidates: LocCandidate[] = [];
  let totalBytes = 0;
  for (const name of limited) {
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
  translations?: LocalizationTranslation[];
  translatedCsv?: string;
}> {
  const mode = input.mode ?? "check";
  if (mode === "translate") {
    return runTranslateAi(deps, input, candidates);
  }
  const goal =
    input.goal ??
    "Audit the localization tables for key coverage, row integrity, and empty values.";
  const prompt = buildPrompt({
    goal:
      input.glossary !== undefined && input.glossary.trim().length > 0
        ? `${goal}\nTerm glossary (obey it): ${input.glossary.trim()}`
        : goal,
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

async function runTranslateAi(
  deps: RunLocalizationDeps,
  input: RunLocalizationInput,
  candidates: LocCandidate[],
): Promise<{
  aiStatus: AiStatus;
  error?: string;
  translations?: LocalizationTranslation[];
  translatedCsv?: string;
}> {
  if (candidates.length === 0) {
    return { aiStatus: "completed", translations: [], translatedCsv: undefined };
  }
  const candidate = candidates[0]!;
  const prompt = buildTranslatePrompt({
    filePath: candidate.relativePath,
    language: input.language,
    key: input.key,
    glossary: input.glossary,
  });
  const requestId = randomUUID();
  const tempPath = join(tmpdir(), `loc-tr-${requestId}.csv`);
  try {
    await writeFile(tempPath, candidate.content, "utf8");
    const raw = await deps.aiClient!.run({
      prompt,
      manifest: {
        schema_version: "1.0",
        request_id: requestId,
        stage: "writer",
        mode: "localization-translate",
        base_ref: input.baseRef,
        attachments: [
          {
            id: "loc-file-1",
            upload_name: "loc-translate.csv",
            relative_path: candidate.relativePath,
            revision: input.baseRef,
            kind: "config",
            content_type: "text/csv",
            size_bytes: candidate.sizeBytes,
            sha256: candidate.sha256,
          },
        ],
      },
      files: [
        {
          absolutePath: tempPath,
          uploadName: "loc-translate.csv",
          contentType: "text/csv",
          sha256: candidate.sha256,
          sizeBytes: candidate.sizeBytes,
        },
      ],
      requestId,
    });
    const parsed = translateAnswerSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Translate answer was not valid JSON.");
    }
    const translations = parsed.data.translations;
    return {
      aiStatus: "completed",
      translations,
      translatedCsv: applyTranslations(candidate.content, translations),
    };
  } catch (error) {
    getLogger().warn({ err: error }, "localization translate failed");
    return {
      aiStatus: "failed",
      error: "The AI workflow did not answer; no translations were produced.",
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

/**
 * Apply translation cells to the CSV text. Matches rows by key (column 0)
 * and columns by language code or header name; only fills cells whose
 * current value equals the reported old value, so concurrent edits are
 * never silently overwritten.
 */
export function applyTranslations(
  content: string,
  translations: LocalizationTranslation[],
): string {
  const rows = parseCsvContent(content);
  if (rows.length === 0) return content;
  const shape = readLocalizationShape(content);
  const header = rows[0]!;
  const columnFor = (language: string): number => {
    const wanted = language.trim().toLowerCase();
    for (let column = 1; column < header.length; column += 1) {
      const code = (shape.languages[column - 1] ?? "").toLowerCase();
      const name = (header[column] ?? "").trim().toLowerCase();
      if (code === wanted || name === wanted) return column;
    }
    return -1;
  };
  const byKey = new Map<number, Map<number, string>>();
  for (const item of translations) {
    const column = columnFor(item.language);
    if (column < 0) continue;
    const rowIndex = rows.findIndex(
      (row, index) => index >= 2 && (row[0] ?? "") === item.key,
    );
    if (rowIndex < 0) continue;
    const current = rows[rowIndex]![column] ?? "";
    if (current !== item.oldValue) continue;
    if (!byKey.has(rowIndex)) byKey.set(rowIndex, new Map());
    byKey.get(rowIndex)!.set(column, item.newValue);
  }
  return rows
    .map((row, index) => {
      const edits = byKey.get(index);
      if (!edits) return serializeCsvRow(row);
      const next = [...row];
      for (const [column, value] of edits) next[column] = value;
      return serializeCsvRow(next);
    })
    .join("\n");
}
