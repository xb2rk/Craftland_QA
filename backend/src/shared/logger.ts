import pino, { type Logger } from "pino";

let cachedLogger: Logger | null = null;

export function createLogger(level = "info"): Logger {
  return pino({
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "res.headers.authorization",
        "*.apiKey",
        "*.api_key",
        "apiKey",
        "*.authorization",
      ],
      censor: "[REDACTED]",
    },
  });
}

export function getLogger(): Logger {
  if (cachedLogger === null) {
    cachedLogger = createLogger(process.env.LOG_LEVEL ?? "info");
  }
  return cachedLogger;
}

export function setLogger(logger: Logger): void {
  cachedLogger = logger;
}
