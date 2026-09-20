export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "ANALYSIS_RUN_NOT_FOUND"
  | "GIT_ERROR"
  | "PROJECT_NOT_A_DIRECTORY"
  | "PROJECT_PATH_NOT_ALLOWED"
  | "AI_NOT_CONFIGURED"
  | "AI_PROTOCOL_ERROR"
  | "AI_REQUEST_FAILED"
  | "PERSISTENCE_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", 400, message, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(code, 404, message);
    this.name = "NotFoundError";
  }
}

export class GitError extends AppError {
  constructor(message: string) {
    // Never include absolute server paths in outward messages; caller redacts.
    super("GIT_ERROR", 422, message);
    this.name = "GitError";
  }
}

export class AIProtocolError extends AppError {
  constructor(message: string) {
    super("AI_PROTOCOL_ERROR", 502, message);
    this.name = "AIProtocolError";
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
