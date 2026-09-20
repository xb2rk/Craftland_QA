export type FindingSeverity = "error" | "warning" | "info";

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  filePath: string;
  line?: number;
  evidence?: Record<string, unknown>;
}
