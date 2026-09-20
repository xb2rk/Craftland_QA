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
  for (const file of files) {
    filesChecked.push(file.relativePath);
    const header = parseCsvContent(file.content)[0] ?? [];
    const keyColumn = header.length > 0 ? header[0] : "";
    findings.push(
      ...auditCsvContent(file.content, {
        filePath: file.relativePath,
        keyColumns: keyColumn === "" ? [] : [keyColumn],
      }).findings,
    );
    findings.push(...checkEmptyValues(file.relativePath, file.content, header));
  }
  return { filesChecked, findings };
}

/** Flag empty value cells, naming the row key and column so designers can fix them. */
function checkEmptyValues(
  filePath: string,
  content: string,
  header: string[],
): Finding[] {
  if (header.length === 0) return [];
  const findings: Finding[] = [];
  const dataRows = parseCsvContent(content).slice(2);
  dataRows.forEach((row, index) => {
    const key = row[0] ?? "";
    for (let column = 1; column < header.length; column += 1) {
      if ((row[column] ?? "") === "") {
        findings.push({
          code: "LOC_EMPTY_VALUE",
          severity: "warning",
          message: `Empty value for key "${key}" in column "${header[column] ?? column}".`,
          filePath,
          line: index + 3,
        });
      }
    }
  });
  return findings;
}
