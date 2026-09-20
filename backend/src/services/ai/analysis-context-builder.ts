import { createHash } from "node:crypto";

import type { Finding } from "../../domain/finding.js";
import type { DiscoveredFile } from "../project-discovery.js";
import type { GitComparison } from "../git-comparison.js";
import type { ProjectInspection } from "../project-inspector.js";
import type {
  WorkflowFile,
  WorkflowRunInput
} from "./insea-workflow-client.js";

export interface BuildAnalysisContextInput {
  analysisId: string;
  goal: string;
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

export function buildAnalysisContext(
  input: BuildAnalysisContextInput
): BuiltAnalysisContext {
  const maxFiles = input.maxFiles ?? 30;
  const maxBytes = input.maxBytes ?? 20 * 1024 * 1024;
  const baseFiles = new Map(
    input.baseInspection.files.map((file) => [file.relativePath, file])
  );
  const currentFiles = new Map(
    input.currentInspection.files.map((file) => [file.relativePath, file])
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

  const files: WorkflowFile[] = [];
  const attachments: Array<Record<string, unknown>> = [];
  let selectedBytes = 0;

  for (const change of rankedChanges) {
    const basePath = change.previousPath ?? change.relativePath;
    const currentPath = change.relativePath;
    const candidates: Array<{
      revision: "base" | "current";
      file: DiscoveredFile;
    }> = [];
    const baseFile = baseFiles.get(basePath);
    const currentFile = currentFiles.get(currentPath);
    if (baseFile?.kind === "config" || baseFile?.kind === "source") {
      candidates.push({ revision: "base", file: baseFile });
    }
    if (currentFile?.kind === "config" || currentFile?.kind === "source") {
      candidates.push({ revision: "current", file: currentFile });
    }
    const candidateBytes = candidates.reduce(
      (total, candidate) => total + candidate.file.sizeBytes,
      0
    );
    if (files.length + candidates.length > maxFiles || selectedBytes + candidateBytes > maxBytes) {
      continue;
    }
    for (const candidate of candidates) {
      const uploadName = makeUploadName(files.length, candidate.file.extension);
      files.push({
        absolutePath: candidate.file.absolutePath,
        uploadName,
        contentType: contentTypeForExtension(candidate.file.extension)
      });
      attachments.push({
        id: `${candidate.revision}-file-${files.length}`,
        upload_name: uploadName,
        relative_path: candidate.file.relativePath,
        revision: candidate.revision,
        kind: candidate.file.kind,
        size_bytes: candidate.file.sizeBytes
      });
      selectedBytes += candidate.file.sizeBytes;
    }
  }

  const manifest = {
    schema_version: "1.0",
    analysis_id: input.analysisId,
    stage: "impact_analysis",
    locale: "en-US",
    project: {
      name: input.currentInspection.rootPath.split(/[\\/]/).at(-1),
      engine: detectEngine(input.currentInspection),
      root_label: input.currentInspection.rootPath.split(/[\\/]/).at(-1)
    },
    revision: {
      base_ref: input.baseRef,
      base_commit: input.comparison.baseCommit,
      current_ref: input.currentRef,
      current_commit: input.comparison.currentCommit,
      current_is_worktree: input.comparison.currentIsWorktree,
      has_uncommitted_changes:
        input.currentInspection.repository.hasUncommittedChanges
    },
    analysis_request: {
      goal: input.goal,
      quality_dimensions: [
        "config_consistency",
        "code_impact",
        "gameplay_impact",
        "flow_safety",
        "recovery",
        "bug_risk"
      ]
    },
    repository_context: {
      summaries: {
        base: input.baseInspection.summary,
        current: input.currentInspection.summary
      },
      changed_files: input.comparison.changedFiles,
      unified_diff: input.comparison.unifiedDiff,
      diff_truncated: input.comparison.diffTruncated,
      trees: {
        base: input.baseInspection.files.map((file) => ({
          path: file.relativePath,
          kind: file.kind,
          size_bytes: file.sizeBytes
        })),
        current: input.currentInspection.files.map((file) => ({
          path: file.relativePath,
          kind: file.kind,
          size_bytes: file.sizeBytes
        }))
      }
    },
    deterministic_findings: input.deterministicFindings,
    attachments,
    limits: {
      max_requested_files: maxFiles,
      max_total_bytes: maxBytes,
      max_follow_up_rounds: 2
    }
  };

  return {
    selectedFileCount: files.length,
    selectedBytes,
    workflowInput: {
      prompt: buildPrompt(input.goal),
      manifest,
      files
    }
  };
}

function buildPrompt(goal: string): string {
  return [
    "You are the Craftland Quality Analyzer.",
    "Compare the base revision against the current revision using only the repository evidence described in Manifest and supplied in DataList.",
    "Distinguish confirmed facts, probable inferences, hypotheses, and unknowns.",
    "Never invent files, symbols, config keys, values, or line numbers.",
    "Every finding must cite repository-relative file paths and line ranges.",
    "Keep JSON property names in English; never translate JSON keys.",
    "Use canonical top-level keys: summary, findings, inferences, hypotheses, unknowns, recommendations, stage, and status.",
    "In summary use: overall_assessment, risk_level, confidence, and change_scope; change_scope must be low, medium, or high.",
    "In each finding use: id, title, dimension, severity, certainty, description, evidence, impact, flow_safety, and recovery_risk.",
    "In each recommendation use: id, priority, dimension, recommendation, justification, and evidence.",
    "Write all human-readable string values in English.",
    "Return exactly one JSON object matching schema version 1.0.",
    "Do not add Markdown outside the JSON object.",
    `User goal: ${goal}`
  ].join("\n");
}

function makeUploadName(index: number, extension: string): string {
  const suffix = extension.length > 0 ? extension : ".txt";
  return `file-${String(index + 1).padStart(4, "0")}${suffix}`;
}

function contentTypeForExtension(extension: string): string {
  if (extension === ".csv") {
    return "text/csv";
  }
  if (extension === ".json") {
    return "application/json";
  }
  if (extension === ".yaml" || extension === ".yml") {
    return "application/yaml";
  }
  return "text/plain";
}

function detectEngine(inspection: ProjectInspection): string {
  const paths = new Set(
    inspection.files.map((file) => file.relativePath.toLowerCase())
  );
  if (
    paths.has("projectsettings/projectversion.txt") ||
    [...paths].some((filePath) => filePath.endsWith(".gproj"))
  ) {
    return "unity_or_craftland";
  }
  return "unknown";
}

export function hashManifest(manifest: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
}
