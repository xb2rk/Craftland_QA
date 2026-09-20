import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import { z } from "zod";

import { AppError } from "../../shared/errors.js";
import { getLogger } from "../../shared/logger.js";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route was not found." },
  });
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.issues,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.status >= 500) {
      getLogger().error({ err: error, path: req.path }, "request failed");
    }
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected error.";
  getLogger().error({ err: error, path: req.path }, "unhandled request error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message },
  });
};
