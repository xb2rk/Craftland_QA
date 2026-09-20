/**
 * Localization consistency checks (deterministic).
 *
 * Responsibility: pure content checks over localization CSV files —
 * row-width and key integrity via the shared auditor, plus empty-value
 * detection the auditor does not cover. No filesystem or AI access.
 */
import { auditCsvContent } from "../configs/csv.auditor.js";
import { parseCsvContent } from "../configs/csv.parser.js";
import type { Finding } from "../analysis/analysis-run.entity.js";

export interface LocalizationFileInput {
  relativePath: string;
  content: string;
}

export interface LocalizationCheckResult {
  filesChecked: string[];
  findings: Finding[];
  /** Language codes from the LanguageKey row, when the table has one. */
  languages: string[];
}

/** A key.csv-style table: first header cell Key, second row LanguageKey codes. */
export interface LocalizationTableShape {
  keyColumn: string;
  languages: string[];
  hasLanguageRow: boolean;
}

/**
 * Read the table shape: header row plus an optional LanguageKey second row
 * mapping each value column to a language code (e.g. "vi" → Vietnamese).
 */
export function readLocalizationShape(content: string): LocalizationTableShape {
  const rows = parseCsvContent(content);
  const header = rows[0] ?? [];
  const second = rows[1] ?? [];
  const hasLanguageRow =
    (second[0] ?? "").trim().toLowerCase() === "languagekey";
  const languages = hasLanguageRow
    ? header.slice(1).map((_, index) => (second[index + 1] ?? "").trim())
    : [];
  return {
    keyColumn: header.length > 0 ? header[0]!.trim() : "",
    languages,
    hasLanguageRow,
  };
}

const LOCALIZATION_BASENAMES = new Set([
  "key.csv",
  "keys.csv",
  "strings.csv",
  "localization.csv",
  "localisation.csv",
  "translations.csv",
]);

const LOCALIZATION_DIRECTORIES = new Set(["localization", "localisation", "l10n"]);

/** True when the path looks like a localization table by directory or name. */
export function isLocalizationFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/");
  if (segments.some((segment) => LOCALIZATION_DIRECTORIES.has(segment))) {
    return true;
  }
  return LOCALIZATION_BASENAMES.has(segments[segments.length - 1] ?? "");
}

export function checkLocalizationFiles(
  files: LocalizationFileInput[],
): LocalizationCheckResult {
  const findings: Finding[] = [];
  const filesChecked: string[] = [];
  const languageSet = new Set<string>();
  for (const file of files) {
    filesChecked.push(file.relativePath);
    const shape = readLocalizationShape(file.content);
    for (const language of shape.languages) {
      if (language !== "") languageSet.add(language);
    }
    findings.push(
      ...auditCsvContent(file.content, {
        filePath: file.relativePath,
        keyColumns: shape.keyColumn === "" ? [] : [shape.keyColumn],
      }).findings,
    );
    findings.push(...checkEmptyValues(file.relativePath, file.content, shape));
  }
  return { filesChecked, findings, languages: [...languageSet].sort() };
}

/** Flag empty value cells, naming the row key and language so QA can fix them. */
function checkEmptyValues(
  filePath: string,
  content: string,
  shape: LocalizationTableShape,
): Finding[] {
  const header = parseCsvContent(content)[0] ?? [];
  if (header.length === 0) return [];
  const findings: Finding[] = [];
  // Data starts after the header and the optional LanguageKey/type row.
  const dataRows = parseCsvContent(content).slice(2);
  dataRows.forEach((row, index) => {
    const key = row[0] ?? "";
    for (let column = 1; column < header.length; column += 1) {
      if ((row[column] ?? "") === "") {
        const language = shape.languages[column - 1] ?? "";
        const where =
          language !== ""
            ? `in ${language} ("${header[column] ?? column}")`
            : `in column "${header[column] ?? column}"`;
        findings.push({
          code: "LOC_EMPTY_VALUE",
          severity: "warning",
          message: `Empty value for key "${key}" ${where}.`,
          filePath,
          line: index + 3,
        });
      }
    }
  });
  return findings;
}
