import type { Finding } from "../api/types.js";

export interface SystemGroup {
  system: string;
  findings: Finding[];
}

const SYSTEM_ORDER = ["Combat", "Economy", "Progression", "Other files"];

const RULES: Array<{ system: string; pattern: RegExp }> = [
  { system: "Combat", pattern: /zombie|boss|skill|mutation|element|plantattack/i },
  { system: "Economy", pattern: /shop|consumable|material|seedpool|merge|break/i },
  { system: "Progression", pattern: /upgrade|seed|plant|tier/i },
];

export function groupFindingsBySystem(findings: Finding[]): SystemGroup[] {
  const buckets = new Map<string, Finding[]>();
  for (const finding of findings) {
    const rule = RULES.find((candidate) => candidate.pattern.test(finding.filePath));
    const system = rule ? rule.system : "Other files";
    const bucket = buckets.get(system) ?? [];
    bucket.push(finding);
    buckets.set(system, bucket);
  }
  return SYSTEM_ORDER.filter((system) => buckets.has(system)).map((system) => ({
    system,
    findings: buckets.get(system)!,
  }));
}

export function humanizeFindingCode(code: string): string {
  const stripped = code.replace(/^(CONFIG|CSV)_/, "");
  return stripped
    .toLowerCase()
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function severityColor(severity: string): string {
  switch (severity) {
    case "error":
      return "red";
    case "warning":
      return "orange";
    default:
      return "blue";
  }
}

export function riskColor(risk: string): string {
  const normalized = risk.toLowerCase();
  if (normalized.includes("high") || normalized === "critical") return "red";
  if (normalized.includes("medium")) return "orange";
  if (normalized.includes("low")) return "green";
  return "default";
}
