import { readFile } from "node:fs/promises";

import { DEFAULT_CONFIG_COMPARE_LIMITS } from "../../config/constants.js";
import type { ChangedFile } from "../git/git-comparison.js";
import type { ProjectInspection } from "../projects/project.service.js";
import { parseCsvContent } from "./csv.parser.js";
import type { Finding } from "../analysis/analysis-run.entity.js";

export interface CompareCsvConfigInput {
  filePath: string;
  keyColumns: string[];
  baseContent: string;
  currentContent: string;
}

export function compareCsvConfigContent(
  input: CompareCsvConfigInput,
): Finding[] {
  if (input.baseContent === input.currentContent) return [];
  const baseRows = parseCsvContent(input.baseContent);
  const currentRows = parseCsvContent(input.currentContent);
  const baseHeader = baseRows[0] ?? [];
  const currentHeader = currentRows[0] ?? [];
  const baseTypes = baseRows[1] ?? [];
  const currentTypes = currentRows[1] ?? [];

  if (
    baseHeader.join("") !== currentHeader.join("") ||
    baseTypes.join("") !== currentTypes.join("")
  ) {
    return [
      {
        code: "CONFIG_SCHEMA_CHANGED",
        severity: "warning",
        message: "CSV header or type definition changed between versions.",
        filePath: input.filePath,
        line: 1,
        evidence: { baseHeader, currentHeader, baseTypes, currentTypes },
      },
    ];
  }

  const keyIndexes = input.keyColumns.map((column) =>
    currentHeader.indexOf(column),
  );
  if (input.keyColumns.length === 0 || keyIndexes.some((i) => i === -1)) {
    return [
      {
        code: "CONFIG_CSV_CONTENT_CHANGED",
        severity: "info",
        message:
          "CSV content changed, but this table has no known stable key for a row-level comparison.",
        filePath: input.filePath,
        line: 1,
        evidence: { keyColumns: input.keyColumns },
      },
    ];
  }

  const baseByKey = indexRows(baseRows.slice(2), keyIndexes, currentHeader.length);
  const currentByKey = indexRows(currentRows.slice(2), keyIndexes, currentHeader.length);
  const findings: Finding[] = [];

  for (const key of sharedKeys(baseByKey, currentByKey)) {
    const baseRow = baseByKey.get(key)!;
    const currentRow = currentByKey.get(key)!;
    for (let ci = 0; ci < currentHeader.length; ci += 1) {
      if (
        keyIndexes.includes(ci) ||
        baseRow.values[ci] === currentRow.values[ci]
      ) {
        continue;
      }
      findings.push({
        code: "CONFIG_VALUE_CHANGED",
        severity: "info",
        message: `${formatKey(input.keyColumns, currentRow.values, keyIndexes)}: ${currentHeader[ci]} changed from "${baseRow.values[ci]}" to "${currentRow.values[ci]}".`,
        filePath: input.filePath,
        line: currentRow.line,
        evidence: {
          key: keyObject(input.keyColumns, currentRow.values, keyIndexes),
          column: currentHeader[ci],
          baseValue: baseRow.values[ci],
          currentValue: currentRow.values[ci],
        },
      });
    }
  }

  for (const key of exclusiveKeys(baseByKey, currentByKey)) {
    const row = baseByKey.get(key)!;
    findings.push({
      code: "CONFIG_RECORD_REMOVED",
      severity: "info",
      message: `${formatKey(input.keyColumns, row.values, keyIndexes)} was removed from the config table.`,
      filePath: input.filePath,
      line: row.line,
      evidence: { key: keyObject(input.keyColumns, row.values, keyIndexes) },
    });
  }
  for (const key of exclusiveKeys(currentByKey, baseByKey)) {
    const row = currentByKey.get(key)!;
    findings.push({
      code: "CONFIG_RECORD_ADDED",
      severity: "info",
      message: `${formatKey(input.keyColumns, row.values, keyIndexes)} was added to the config table.`,
      filePath: input.filePath,
      line: row.line,
      evidence: { key: keyObject(input.keyColumns, row.values, keyIndexes) },
    });
  }
  return findings;
}

export async function compareProjectConfigs(
  baseInspection: ProjectInspection,
  currentInspection: ProjectInspection,
  changedFiles: ChangedFile[],
  options: { maxFindings?: number } = {},
): Promise<Finding[]> {
  const maxFindings =
    options.maxFindings ?? DEFAULT_CONFIG_COMPARE_LIMITS.maxFindings;
  const baseFiles = new Map(
    baseInspection.files.map((file) => [file.relativePath, file]),
  );
  const currentFiles = new Map(
    currentInspection.files.map((file) => [file.relativePath, file]),
  );
  const findings: Finding[] = [];

  for (const change of changedFiles) {
    if (findings.length >= maxFindings) break;
    const baseFile = baseFiles.get(change.previousPath ?? change.relativePath);
    const currentFile = currentFiles.get(change.relativePath);
    if (baseFile?.kind !== "config" && currentFile?.kind !== "config") continue;

    if (baseFile === undefined) {
      findings.push(fileChangeFinding("CONFIG_FILE_ADDED", change.relativePath));
      continue;
    }
    if (currentFile === undefined) {
      findings.push(fileChangeFinding("CONFIG_FILE_REMOVED", change.relativePath));
      continue;
    }
    if (change.changeType === "renamed") {
      findings.push({
        ...fileChangeFinding("CONFIG_FILE_RENAMED", change.relativePath),
        evidence: { previousPath: change.previousPath },
      });
    }
    if (baseFile.extension !== ".csv" || currentFile.extension !== ".csv") {
      findings.push(fileChangeFinding("CONFIG_FILE_CHANGED", change.relativePath));
      continue;
    }

    const [baseContent, currentContent] = await Promise.all([
      readFile(baseFile.absolutePath, "utf8"),
      readFile(currentFile.absolutePath, "utf8"),
    ]);
    const currentParsed = parseCsvContent(currentContent);
    const header = currentParsed[0] ?? [];
    findings.push(
      ...compareCsvConfigContent({
        filePath: change.relativePath,
        keyColumns: inferKeyColumns(header, currentParsed.slice(2)),
        baseContent,
        currentContent,
      }),
    );
  }

  if (findings.length >= maxFindings) {
    findings.push({
      code: "CONFIG_CHANGE_RESULTS_TRUNCATED",
      severity: "warning",
      message: `Config comparison stopped after ${maxFindings} findings.`,
      filePath: "<analysis>",
    });
  }
  return findings.slice(0, maxFindings + 1);
}

function indexRows(rows: string[][], keyIndexes: number[], width: number) {
  const indexed = new Map<string, { values: string[]; line: number }>();
  rows.forEach((values, index) => {
    if (values.length !== width) return;
    indexed.set(keyIndexes.map((ki) => values[ki]).join(""), {
      values,
      line: index + 3,
    });
  });
  return indexed;
}

function sharedKeys<T>(left: Map<string, T>, right: Map<string, T>) {
  return [...left.keys()]
    .filter((key) => right.has(key))
    .sort((a, b) => a.localeCompare(b));
}

function exclusiveKeys<T>(left: Map<string, T>, right: Map<string, T>) {
  return [...left.keys()]
    .filter((key) => !right.has(key))
    .sort((a, b) => a.localeCompare(b));
}

function keyObject(keys: string[], values: string[], indexes: number[]) {
  return Object.fromEntries(
    keys.map((key, index) => [key, values[indexes[index]]]),
  );
}

function formatKey(keys: string[], values: string[], indexes: number[]) {
  return keys.map((key, index) => `${key}=${values[indexes[index]]}`).join(", ");
}

function fileChangeFinding(code: string, filePath: string): Finding {
  const labels: Record<string, string> = {
    CONFIG_FILE_ADDED: "Config file was added.",
    CONFIG_FILE_REMOVED: "Config file was removed.",
    CONFIG_FILE_RENAMED: "Config file was renamed.",
    CONFIG_FILE_CHANGED: "Non-CSV config file changed.",
  };
  return { code, severity: "info", message: labels[code], filePath, line: 1 };
}

export function inferKeyColumns(header: string[], rows: string[][]): string[] {
  const idColumn = header.find(
    (column) => column.toLowerCase() === "id",
  );
  if (idColumn !== undefined) return [idColumn];

  for (let index = 0; index < header.length; index += 1) {
    const seen = new Set<string>();
    let unique = true;
    for (const row of rows) {
      if (row.length !== header.length) continue;
      const value = row[index];
      if (seen.has(value)) {
        unique = false;
        break;
      }
      seen.add(value);
    }
    if (unique && seen.size > 0) return [header[index]];
  }
  return [];
}
