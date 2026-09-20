import { ANALYSIS_LENSES, VERBOSITIES } from "../api/types.js";
import type { AnalysisLens, Verbosity } from "../api/types.js";

export interface PromptTemplate {
  id: string;
  name: string;
  goal: string;
  lens: AnalysisLens;
  verbosity: Verbosity;
}

export interface AppSettings {
  verbosity: Verbosity;
  defaultLens: AnalysisLens;
  templates: PromptTemplate[];
}

const SETTINGS_KEY = "cqa.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  verbosity: "auto",
  defaultLens: "pre_merge",
  templates: [],
};

const VERBOSITY_VALUES = new Set<string>(VERBOSITIES.map((entry) => entry.value));
const LENS_VALUES = new Set<string>(ANALYSIS_LENSES.map((entry) => entry.value));

function readJson(key: string): AppSettings {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const verbosity =
      typeof parsed.verbosity === "string" && VERBOSITY_VALUES.has(parsed.verbosity)
        ? (parsed.verbosity as Verbosity)
        : DEFAULT_SETTINGS.verbosity;
    const defaultLens =
      typeof parsed.defaultLens === "string" && LENS_VALUES.has(parsed.defaultLens)
        ? (parsed.defaultLens as AnalysisLens)
        : DEFAULT_SETTINGS.defaultLens;
    return {
      verbosity,
      defaultLens,
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function loadSettings(): AppSettings {
  return readJson(SETTINGS_KEY);
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function newTemplateId(): string {
  const cryptoObject = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  return `template-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
