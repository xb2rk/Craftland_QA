export const CQA_RADIUS = 12;

export const CQA_SHADOW_CARD = "0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px -12px rgba(79, 70, 229, 0.25)";

export const CQA_SHADOW_POP = "0 12px 32px -12px rgba(15, 23, 42, 0.35)";

export const CQA_PALETTE = {
  primary: "#4f46e5",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e5e7eb",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  info: "#0ea5e9",
} as const;

export type StatusTone = "green" | "blue" | "red" | "orange" | "gray";

export function runStatusTone(status: string): { tone: StatusTone; pulse: boolean } {
  switch (status) {
    case "running":
    case "queued":
      return { tone: "blue", pulse: true };
    case "completed":
      return { tone: "green", pulse: false };
    case "failed":
      return { tone: "red", pulse: false };
    default:
      return { tone: "gray", pulse: false };
  }
}
