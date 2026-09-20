import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  AnalysisLens,
  Finding,
  Verbosity,
} from "../analysis/analysis-run.entity.js";
import type { DiscoveredFile } from "../discovery/file-classifier.js";
import type { GitComparison } from "../git/git-comparison.js";
import type { ProjectInspection } from "../projects/project.service.js";
import { buildPrompt } from "./prompt.builder.js";

export interface WorkflowFile {
  absolutePath: string;
  uploadName: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
}

export interface WorkflowRunInput {
  prompt: string;
  manifest: Record<string, unknown>;
  files: WorkflowFile[];
  requestId: string;
}

export interface BuildAnalysisContextInput {
  analysisId: string;
  requestId: string;
  goal: string;
  lens?: AnalysisLens;
  verbosity?: Verbosity;
  notes?: string;
  focusPaths?: string[];
  baseRef: string;
  currentRef: string;
  baseInspection: ProjectInspection;
  currentInspection: ProjectInspection;
  comparison: GitComparison;
  deterministicFindings: Finding[];
  maxFiles?: number;
  maxBytes?: number;
}

export interface BuiltAnalysisContext {
  workflowInput: WorkflowRunInput;
  selectedFileCount: number;
  selectedBytes: number;
}

export async function buildAnalysisContext(
  input: BuildAnalysisContextInput,
): Promise<BuiltAnalysisContext> {
  const maxFiles = input.maxFiles ?? 30;
  const maxBytes = input.maxBytes ?? 500_000;
  const baseFiles = new Map(
    input.baseInspection.files.map((file) => [file.relativePath, file]),
  );
  const currentFiles = new Map(
    input.currentInspection.files.map((file) => [file.relativePath, file]),
  );
  const rankedChanges = [...input.comparison.changedFiles].sort((left, right) => {
    const leftBase = baseFiles.get(left.previousPath ?? left.relativePath);
    const leftCurrent = currentFiles.get(left.relativePath);
    const rightBase = baseFiles.get(right.previousPath ?? right.relativePath);
    const rightCurrent = currentFiles.get(right.relativePath);
    const leftKind = leftCurrent?.kind ?? leftBase?.kind;
    const rightKind = rightCurrent?.kind ?? rightBase?.kind;
    if (leftKind !== rightKind) return leftKind === "config" ? -1 : 1;
    return left.relativePath.localeCompare(right.relativePath);
  });
  const focus = new Set((input.focusPaths ?? []).map((path) => path.trim()));
  const orderedChanges =
    focus.size === 0
      ? rankedChanges
      : [
          ...rankedChanges.filter((change) => focus.has(change.relativePath)),
          ...rankedChanges.filter((change) => !focus.has(change.relativePath)),
        ];

  const files: WorkflowFile[] = [];
  const attachments: Array<Record<string, unknown>> = [];
  let selectedBytes = 0;

  for (const change of orderedChanges) {
    const basePath = change.previousPath ?? change.relativePath;
    const candidates: Array<{ revision: "base" | "current"; file: DiscoveredFile }> = [];
    const baseFile = baseFiles.get(basePath);
    const currentFile = currentFiles.get(change.relativePath);
    if (baseFile?.kind === "config" || baseFile?.kind === "source") {
      candidates.push({ revision: "base", file: baseFile });
    }
    if (currentFile?.kind === "config" || currentFile?.kind === "source") {
      candidates.push({ revision: "current", file: currentFile });
    }
    const candidateBytes = candidates.reduce((total, c) => total + c.file.sizeBytes, 0);
    if (
      files.length + candidates.length > maxFiles ||
      selectedBytes + candidateBytes > maxBytes
    ) {
      continue;
    }
    for (const candidate of candidates) {
      const uploadName = makeUploadName(files.length, candidate.file.extension);
      const sha256 = await hashFile(candidate.file.absolutePath);
      const workflowFile: WorkflowFile = {
        absolutePath: candidate.file.absolutePath,
        uploadName,
        contentType: contentTypeForExtension(candidate.file.extension),
        sha256,
        sizeBytes: candidate.file.sizeBytes,
      };
      files.push(workflowFile);
      attachments.push({
        id: `${candidate.revision}-file-${files.length}`,
        upload_name: uploadName,
        relative_path: candidate.file.relativePath,
        revision: candidate.revision,
        kind: candidate.file.kind,
        content_type: workflowFile.contentType,
        size_bytes: candidate.file.sizeBytes,
        sha256,
      });
      selectedBytes += candidate.file.sizeBytes;
    }
  }

  const projectName =
    input.currentInspection.rootPath.split(/[\\/]/).at(-1) ?? "unknown";

  const manifest = {
    schema_version: "1.0",
    request_id: input.requestId,
    analysis_id: input.analysisId,
    stage: "impact_analysis",
    locale: "en-US",
    project: {
      name: projectName,
      engine: detectEngine(input.currentInspection),
      root_label: projectName,
    },
    revision: {
      base_ref: input.baseRef,
      base_commit: input.comparison.baseCommit,
      current_ref: input.currentRef,
      current_commit: input.comparison.currentCommit,
      current_is_worktree: input.comparison.currentIsWorktree,
      has_uncommitted_changes:
        input.currentInspection.repository.hasUncommittedChanges,
    },
    analysis_request: {
      goal: input.goal,
      lens: input.lens ?? "pre_merge",
      verbosity: input.verbosity ?? "auto",
      ...(input.notes !== undefined && input.notes.length > 0
        ? { notes: input.notes }
        : {}),
      ...(focus.size > 0 ? { focus_paths: [...focus] } : {}),
      quality_dimensions: [
        "config_consistency",
        "code_impact",
        "gameplay_impact",
        "flow_safety",
        "recovery",
        "bug_risk",
      ],
    },
    repository_context: {
      summaries: {
        base: input.baseInspection.summary,
        current: input.currentInspection.summary,
      },
      changed_files: input.comparison.changedFiles,
      unified_diff: input.comparison.unifiedDiff,
      diff_truncated: input.comparison.diffTruncated,
    },
    deterministic_findings: input.deterministicFindings,
    attachments,
    limits: {
      max_requested_files: maxFiles,
      max_total_bytes: maxBytes,
      max_follow_up_rounds: 2,
    },
  };

  return {
    selectedFileCount: files.length,
    selectedBytes,
    workflowInput: {
      prompt: buildPrompt({
        goal: input.goal,
        lens: input.lens,
        verbosity: input.verbosity,
        notes: input.notes,
        focusPaths: focus.size > 0 ? [...focus] : undefined,
      }),
      manifest,
      files,
      requestId: input.requestId,
    },
  };
}

async function hashFile(absolutePath: string): Promise<string> {
  try {
    const content = await readFile(absolutePath);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "unavailable";
  }
}

function makeUploadName(index: number, extension: string): string {
  const suffix = extension.length > 0 ? extension : ".txt";
  return `file-${String(index + 1).padStart(4, "0")}${suffix}`;
}

function contentTypeForExtension(extension: string): string {
  if (extension === ".csv") return "text/csv";
  if (extension === ".json") return "application/json";
  if (extension === ".yaml" || extension === ".yml") return "application/yaml";
  return "text/plain";
}

function detectEngine(inspection: ProjectInspection): string {
  const paths = new Set(
    inspection.files.map((file) => file.relativePath.toLowerCase()),
  );
  if (
    paths.has("projectsettings/projectversion.txt") ||
    [...paths].some((filePath) => filePath.endsWith(".gproj"))
  ) {
    return "unity_or_craftland";
  }
  return "unknown";
}
