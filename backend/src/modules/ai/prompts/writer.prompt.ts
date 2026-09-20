/**
 * Writer prompts (commit-message and PR-description drafting).
 *
 * Responsibility: turn a base→current diff digest into copy-pasteable
 * text. Output is a single JSON object `{ "text": "..." }` so the API can
 * validate it with one schema regardless of kind.
 */
import { AI_PROMPT_VERSION, joinPromptLines } from "./shared.js";

export type WriterKind = "commit" | "pr";

export interface WriterDigestFile {
  relativePath: string;
  changeType: string;
}

export interface BuildWriterPromptInput {
  kind: WriterKind;
  baseRef: string;
  currentRef: string;
  changedFiles: WriterDigestFile[];
  commitSubjects: string[];
  diffExcerpt: string;
  goal?: string;
}

const COMMIT_RULES: readonly string[] = [
  "Write ONE conventional-commit message: `<type>(<scope>): <subject>` on the first line.",
  "Type must be one of: feat, fix, chore, refactor, docs, test, perf, build.",
  "Subject: imperative mood, lowercase, no trailing period, at most 72 characters.",
  "After a blank line, add 1-5 short bullets naming the concrete changes (old vs new values when known).",
  "Derive scope from the most-touched directory or system; omit scope when the change spans many areas.",
];

const PR_RULES: readonly string[] = [
  "Write a pull-request description in Markdown with exactly these sections:",
  "## Summary (2-4 sentences: what changed and why it matters to players/designers)",
  "## Changes (bullets grouped by area; cite repository-relative file paths)",
  "## Test plan (numbered checklist a reviewer can execute)",
  "Keep it factual: only changes present in the evidence. Mark anything inferred with _(inferred)_." ,
];

export function buildWriterPrompt(input: BuildWriterPromptInput): string {
  const files = input.changedFiles
    .slice(0, 80)
    .map((file) => `${file.changeType}:${file.relativePath}`)
    .join(", ");
  const subjects =
    input.commitSubjects.length === 0
      ? "No commits in range."
      : input.commitSubjects
          .slice(0, 20)
          .map((subject) => `- ${subject}`)
          .join("\n");
  return joinPromptLines([
    `You are the Craftland Quality Analyzer (prompt v${AI_PROMPT_VERSION}).`,
    "Current stage: writer.",
    `Task: draft a ${input.kind === "commit" ? "commit message" : "pull-request description"} for ${input.baseRef} → ${input.currentRef}.`,
    ...(input.kind === "commit" ? COMMIT_RULES : PR_RULES),
    "Use only the evidence below. Never invent files, values, or ticket numbers.",
    "Write all human-readable strings in English.",
    'Return exactly one JSON object with a single key: text (string). Example: {"text": "..."}.',
    "Do not add Markdown outside the JSON object (the text value itself may contain Markdown for kind=pr).",
    ...(input.goal !== undefined && input.goal.length > 0
      ? [`Author context: ${input.goal}`]
      : []),
    `Changed files (${input.changedFiles.length}): ${files.length > 0 ? files : "none"}.`,
    `Commits in range:\n${subjects}`,
    `Diff excerpt:\n${input.diffExcerpt.length > 0 ? input.diffExcerpt : "(empty)"}`,
  ]);
}
