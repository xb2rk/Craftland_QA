/**
 * Localization prompts (translate and ask modes).
 *
 * Responsibility: turn a key.csv-style table plus a QA scope into
 * tightly-scoped AI requests. Translate mode returns machine-readable cell
 * updates the API validates; ask mode returns a cited prose answer. The
 * table itself travels as a DataList attachment — never inline.
 */
import { AI_PROMPT_VERSION, joinPromptLines } from "./shared.js";

export interface LocalizationTranslation {
  key: string;
  language: string;
  oldValue: string;
  newValue: string;
}

export interface BuildTranslatePromptInput {
  filePath: string;
  language?: string;
  key?: string;
  glossary?: string;
}

export interface BuildLocalizationAskPromptInput {
  filePath: string;
  question: string;
  history: Array<{ question: string; answer: string }>;
  glossary?: string;
}

export function buildTranslatePrompt(input: BuildTranslatePromptInput): string {
  const scope =
    input.key !== undefined
      ? `a single key ("${input.key}")`
      : input.language !== undefined
        ? `one language column ("${input.language}")`
        : "every empty cell in the attached table";
  return joinPromptLines([
    `You are the Craftland Quality Analyzer (prompt v${AI_PROMPT_VERSION}).`,
    "Current stage: writer.",
    `Task: translate ${scope} of the attached localization table (${input.filePath}).`,
    "Translate FROM the English cell of the same row. Leave a cell empty (do not guess) when the English source is itself empty.",
    "Preserve placeholders, tags, and formatting tokens exactly (e.g. {0}, <b>, %s, \\n).",
    "Preserve game proper nouns (titles, character and item names) unless the glossary says otherwise.",
    ...(input.glossary !== undefined && input.glossary.length > 0
      ? [`Term glossary (obey it): ${input.glossary}`]
      : []),
    "Write all human-readable strings in English except the translated values themselves.",
    'Return exactly one JSON object: { "translations": [ { "key": string, "language": string, "oldValue": string, "newValue": string } ] }.',
    "Do not add Markdown outside the JSON object.",
  ]);
}

export function buildLocalizationAskPrompt(
  input: BuildLocalizationAskPromptInput,
): string {
  const history =
    input.history.length === 0
      ? "No earlier questions."
      : input.history
          .slice(-6)
          .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
          .join("\n---\n");
  return joinPromptLines([
    `You are the Craftland Quality Analyzer (prompt v${AI_PROMPT_VERSION}).`,
    "Current stage: followup_qa.",
    `Task: answer a localization QA question about ${input.filePath} using only the attached table.`,
    "Cite the keys you relied on. Say plainly when the table does not contain the answer.",
    ...(input.glossary !== undefined && input.glossary.length > 0
      ? [`Term glossary (obey it): ${input.glossary}`]
      : []),
    "Write all human-readable strings in English.",
    'Return exactly one JSON object: { "answer": string, "citations": string[] }.',
    "Do not add Markdown outside the JSON object.",
    `Earlier conversation:\n${history}`,
    `Question: ${input.question}`,
  ]);
}
