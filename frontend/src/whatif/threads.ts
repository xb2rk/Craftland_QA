import type { WhatIfResult } from "../api/types.js";

export type WhatIfMessageStatus = "pending" | "answered" | "needs-detail";

export interface WhatIfMessage {
  id: string;
  projectId: string;
  baseRef: string;
  question: string;
  filePath?: string;
  keyColumn?: string;
  keyValue?: string;
  column?: string;
  newValue?: string;
  notes: string[];
  status: WhatIfMessageStatus;
  result?: WhatIfResult;
  error?: string;
  createdAt: string;
}

const THREADS_KEY = "cqa.whatif.threads.v1";
const MAX_THREADS = 100;

export function loadThreads(): WhatIfMessage[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is WhatIfMessage =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as WhatIfMessage).id === "string" &&
        typeof (entry as WhatIfMessage).question === "string",
    );
  } catch {
    return [];
  }
}

export function saveThreads(threads: WhatIfMessage[]): void {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, MAX_THREADS)));
}

export function newThreadId(): string {
  const cryptoObject = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  return `whatif-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
