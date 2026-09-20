import type { WhatIfResult } from "../api/types.js";

export interface WhatIfScenario {
  id: string;
  projectId: string;
  filePath: string;
  baseRef: string;
  keyColumn: string;
  keyValue: string;
  column: string;
  newValue: string;
  goal: string;
  result?: WhatIfResult;
  createdAt: string;
}

const SCENARIOS_KEY = "cqa.scenarios.v1";

export function loadScenarios(): WhatIfScenario[] {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WhatIfScenario[]) : [];
  } catch {
    return [];
  }
}

export function saveScenarios(scenarios: WhatIfScenario[]): void {
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
}

export function newScenarioId(): string {
  const cryptoObject = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  return `scenario-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
