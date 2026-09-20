import { readFile } from "node:fs/promises";

import { parseCsvContent } from "../domain/csv-auditor.js";
import type { Finding } from "../domain/finding.js";
import type { ChangedFile } from "./git-comparison.js";
import type { ProjectInspection } from "./project-inspector.js";

export interface CompareCsvConfigInput {
  filePath: string;
  keyColumns: string[];
  baseContent: string;
  currentContent: string;
}

export function compareCsvConfigContent(
  input: CompareCsvConfigInput
): Finding[] {
  if (input.baseContent === input.currentContent) {
    return [];
  }

  const baseRows = parseCsvContent(input.baseContent);
  const currentRows = parseCsvContent(input.currentContent);
  const baseHeader = baseRows[0] ?? [];
  const currentHeader = currentRows[0] ?? [];
  const baseTypes = baseRows[1] ?? [];
  const currentTypes = currentRows[1] ?? [];

  if (
    baseHeader.join("\u001f") !== currentHeader.join("\u001f") ||
    baseTypes.join("\u001f") !== currentTypes.join("\u001f")
  ) {
    return [
      {
        code: "CONFIG_SCHEMA_CHANGED",
        severity: "warning",
        message: "CSV header or type definition changed between versions.",
        filePath: input.filePath,
        line: 1,
        evidence: {
          baseHeader,
          currentHeader,
          baseTypes,
          currentTypes
        }
      }
    ];
  }

  const keyIndexes = input.keyColumns.map((column) =>
    currentHeader.indexOf(column)
  );
  if (
    input.keyColumns.length === 0 ||
    keyIndexes.some((index) => index === -1)
  ) {
    return [
      {
        code: "CONFIG_CSV_CONTENT_CHANGED",
        severity: "info",
        message:
          "CSV content changed, but this table has no known stable key for a row-level comparison.",
        filePath: input.filePath,
        line: 1,
        evidence: { keyColumns: input.keyColumns }
      }
    ];
  }

  const baseByKey = indexRows(baseRows.slice(2), keyIndexes, currentHeader.length);
  const currentByKey = indexRows(
    currentRows.slice(2),
    keyIndexes,
    currentHeader.length
  );
  const findings: Finding[] = [];

  for (const key of sortedSharedKeys(baseByKey, currentByKey)) {
    const baseRow = baseByKey.get(key)!;
    const currentRow = currentByKey.get(key)!;
    for (let columnIndex = 0; columnIndex < currentHeader.length; columnIndex += 1) {
      if (keyIndexes.includes(columnIndex) || baseRow.values[columnIndex] === currentRow.values[columnIndex]) {
        continue;
      }
      findings.push({
        code: "CONFIG_VALUE_CHANGED",
        severity: "info",
        message: `${formatKey(input.keyColumns, currentRow.values, keyIndexes)}: ${currentHeader[columnIndex]} changed from "${baseRow.values[columnIndex]}" to "${currentRow.values[columnIndex]}".`,
        filePath: input.filePath,
        line: currentRow.line,
        evidence: {
          key: keyObject(input.keyColumns, currentRow.values, keyIndexes),
          column: currentHeader[columnIndex],
          baseValue: baseRow.values[columnIndex],
          currentValue: currentRow.values[columnIndex]
        }
      });
    }
  }

  for (const key of sortedExclusiveKeys(baseByKey, currentByKey)) {
    const row = baseByKey.get(key)!;
    findings.push({
      code: "CONFIG_RECORD_REMOVED",
      severity: "info",
      message: `${formatKey(input.keyColumns, row.values, keyIndexes)} was removed from the config table.`,
      filePath: input.filePath,
      line: row.line,
      evidence: { key: keyObject(input.keyColumns, row.values, keyIndexes) }
    });
  }

  for (const key of sortedExclusiveKeys(currentByKey, baseByKey)) {
    const row = currentByKey.get(key)!;
    findings.push({
      code: "CONFIG_RECORD_ADDED",
      severity: "info",
      message: `${formatKey(input.keyColumns, row.values, keyIndexes)} was added to the config table.`,
      filePath: input.filePath,
      line: row.line,
      evidence: { key: keyObject(input.keyColumns, row.values, keyIndexes) }
    });
  }

  return findings;
}

export async function compareProjectConfigs(
  baseInspection: ProjectInspection,
  currentInspection: ProjectInspection,
  changedFiles: ChangedFile[],
  options: { maxFindings?: number } = {}
): Promise<Finding[]> {
  const maxFindings = options.maxFindings ?? 500;
  const baseFiles = new Map(
    baseInspection.files.map((file) => [file.relativePath, file])
  );
  const currentFiles = new Map(
    currentInspection.files.map((file) => [file.relativePath, file])
  );
  const findings: Finding[] = [];

  for (const change of changedFiles) {
    if (findings.length >= maxFindings) {
      break;
    }
    const baseFile = baseFiles.get(change.previousPath ?? change.relativePath);
    const currentFile = currentFiles.get(change.relativePath);
    if (baseFile?.kind !== "config" && currentFile?.kind !== "config") {
      continue;
    }

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
        evidence: { previousPath: change.previousPath }
      });
    }
    if (baseFile.extension !== ".csv" || currentFile.extension !== ".csv") {
      findings.push(fileChangeFinding("CONFIG_FILE_CHANGED", change.relativePath));
      continue;
    }

    const [baseContent, currentContent] = await Promise.all([
      readFile(baseFile.absolutePath, "utf8"),
      readFile(currentFile.absolutePath, "utf8")
    ]);
    const header = parseCsvContent(currentContent)[0] ?? [];
    const keyColumns = knownKeyColumns(change.relativePath, header);
    findings.push(
      ...compareCsvConfigContent({
        filePath: change.relativePath,
        keyColumns,
        baseContent,
        currentContent
      })
    );
  }

  if (findings.length >= maxFindings) {
    findings.push({
      code: "CONFIG_CHANGE_RESULTS_TRUNCATED",
      severity: "warning",
      message: `Config comparison stopped after ${maxFindings} findings.`,
      filePath: "<analysis>"
    });
  }
  return findings.slice(0, maxFindings + 1);
}

function knownKeyColumns(filePath: string, header: string[]): string[] {
  const fileName = filePath.split("/").at(-1)?.toLowerCase();
  if (fileName === "breaktierdata.csv" || fileName === "mergetierdata.csv") {
    return ["Tier", "Order"];
  }
  const idKeyedFiles = new Set([
    "activeskilldata.csv",
    "bossdata.csv",
    "consumabledata.csv",
    "itemdata.csv",
    "materialdata.csv",
    "mutationdata.csv",
    "passiveskilldata.csv",
    "plantdata.csv",
    "seeddata.csv",
    "zombiedata.csv"
  ]);
  if (fileName !== undefined && idKeyedFiles.has(fileName)) {
    return ["Id"];
  }
  if (fileName === "plantattackvisualdata.csv") return ["PlantId"];
  if (fileName === "seedpooldata.csv") return ["SeedPoolId"];
  if (fileName === "shopdata.csv") return ["ShopId"];
  if (fileName === "upgradedata.csv") return ["UpgradeType"];
  if (fileName === "elementdata.csv") return ["Element"];
  return header.includes("Id") ? ["Id"] : [];
}

function indexRows(rows: string[][], keyIndexes: number[], width: number) {
  const indexed = new Map<string, { values: string[]; line: number }>();
  rows.forEach((values, index) => {
    if (values.length !== width) return;
    indexed.set(keyIndexes.map((keyIndex) => values[keyIndex]).join("\u001f"), {
      values,
      line: index + 3
    });
  });
  return indexed;
}

function sortedSharedKeys<T>(left: Map<string, T>, right: Map<string, T>) {
  return [...left.keys()]
    .filter((key) => right.has(key))
    .sort((first, second) => first.localeCompare(second));
}

function sortedExclusiveKeys<T>(left: Map<string, T>, right: Map<string, T>) {
  return [...left.keys()]
    .filter((key) => !right.has(key))
    .sort((first, second) => first.localeCompare(second));
}

function keyObject(keys: string[], values: string[], indexes: number[]) {
  return Object.fromEntries(keys.map((key, index) => [key, values[indexes[index]]]));
}

function formatKey(keys: string[], values: string[], indexes: number[]) {
  return keys.map((key, index) => `${key}=${values[indexes[index]]}`).join(", ");
}

function fileChangeFinding(code: string, filePath: string): Finding {
  const labels: Record<string, string> = {
    CONFIG_FILE_ADDED: "Config file was added.",
    CONFIG_FILE_REMOVED: "Config file was removed.",
    CONFIG_FILE_RENAMED: "Config file was renamed.",
    CONFIG_FILE_CHANGED: "Non-CSV config file changed."
  };
  return { code, severity: "info", message: labels[code], filePath, line: 1 };
}
