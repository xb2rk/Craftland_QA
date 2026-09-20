import type { Finding } from "./finding.js";

export interface CsvAuditOptions {
  filePath: string;
  keyColumns?: string[];
}

export interface CsvAuditResult {
  header: string[];
  types: string[];
  rowCount: number;
  findings: Finding[];
}

export function auditCsvContent(
  content: string,
  options: CsvAuditOptions
): CsvAuditResult {
  const rows = parseCsvContent(content);
  const header = rows[0] ?? [];
  const types = rows[1] ?? [];
  const dataRows = rows.slice(2);
  const findings: Finding[] = [];

  if (rows.length < 2) {
    findings.push({
      code: "CSV_MISSING_HEADER_OR_TYPE_ROW",
      severity: "error",
      message: "CSV must contain a header row and a type row.",
      filePath: options.filePath,
      line: rows.length + 1
    });
    return { header, types, rowCount: 0, findings };
  }

  if (header.length !== types.length) {
    findings.push({
      code: "CSV_TYPE_COLUMN_MISMATCH",
      severity: "error",
      message: `Type row has ${types.length} columns; expected ${header.length}.`,
      filePath: options.filePath,
      line: 2,
      evidence: {
        expectedColumns: header.length,
        actualColumns: types.length
      }
    });
  }

  dataRows.forEach((row, index) => {
    if (row.length !== header.length) {
      findings.push({
        code: "CSV_ROW_COLUMN_MISMATCH",
        severity: "error",
        message: `Row has ${row.length} columns; expected ${header.length}.`,
        filePath: options.filePath,
        line: index + 3,
        evidence: {
          expectedColumns: header.length,
          actualColumns: row.length
        }
      });
    }
  });

  const keyColumns = options.keyColumns ?? [];
  if (keyColumns.length > 0) {
    const keyIndexes = keyColumns.map((column) => header.indexOf(column));
    const missingColumns = keyColumns.filter(
      (_, index) => keyIndexes[index] === -1
    );

    if (missingColumns.length > 0) {
      findings.push({
        code: "CSV_KEY_COLUMN_MISSING",
        severity: "error",
        message: `Key columns are missing: ${missingColumns.join(", ")}.`,
        filePath: options.filePath,
        line: 1
      });
    } else {
      const seenKeys = new Map<string, number>();
      dataRows.forEach((row, index) => {
        if (row.length !== header.length) {
          return;
        }
        const key = keyIndexes.map((keyIndex) => row[keyIndex]).join("\u001f");
        const line = index + 3;
        const firstLine = seenKeys.get(key);
        if (firstLine !== undefined) {
          findings.push({
            code: "CSV_DUPLICATE_KEY",
            severity: "error",
            message: `Duplicate key (${keyColumns.join(", ")}) first seen on line ${firstLine}.`,
            filePath: options.filePath,
            line,
            evidence: {
              keyColumns,
              keyValues: keyIndexes.map((keyIndex) => row[keyIndex]),
              firstLine
            }
          });
        } else {
          seenKeys.set(key, line);
        }
      });
    }
  }

  return {
    header,
    types,
    rowCount: dataRows.length,
    findings
  };
}

export function parseCsvContent(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
}
