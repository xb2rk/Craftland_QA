import type { AnalysisRun, NormalizedAiReport } from "../api/types.js";

const CHECKLIST_KEY_PREFIX = "cqa.checklist.";

export function checklistStorageKey(runId: string): string {
  return `${CHECKLIST_KEY_PREFIX}${runId}`;
}

export function loadChecklist(runId: string): string[] {
  try {
    const raw = localStorage.getItem(checklistStorageKey(runId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function saveChecklist(runId: string, checked: string[]): void {
  localStorage.setItem(checklistStorageKey(runId), JSON.stringify(checked));
}

interface ChecklistItem {
  id: string;
  priority: string;
  text: string;
}

export function checklistItems(run: AnalysisRun): ChecklistItem[] {
  const report = run.aiReport as NormalizedAiReport | undefined;
  const recommendations = Array.isArray(report?.recommendations)
    ? report.recommendations
    : [];
  return recommendations.map((item, index) => ({
    id: String(item.id ?? `rec-${index}`),
    priority: String(item.priority ?? "medium"),
    text: String(item.recommendation ?? ""),
  }));
}

export function checklistMarkdown(run: AnalysisRun, checked: string[]): string {
  const items = checklistItems(run);
  const lines = [
    `# Fix-it checklist — ${run.goal}`,
    ``,
    `Run: ${run.id} · ${run.baseRef} → ${run.currentRef} · ${run.localPath}`,
    ``,
  ];
  for (const item of items) {
    const done = checked.includes(item.id) ? "x" : " ";
    lines.push(`- [${done}] [${item.priority}] ${item.text}`);
  }
  if (items.length === 0) {
    lines.push(`- [ ] No AI recommendations — verify deterministic findings instead.`);
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportRunJson(run: AnalysisRun): void {
  downloadTextFile(`analysis-run-${run.id}.json`, JSON.stringify(run, null, 2), "application/json");
}

export function exportChecklistMarkdown(run: AnalysisRun, checked: string[]): void {
  downloadTextFile(`checklist-${run.id}.md`, checklistMarkdown(run, checked), "text/markdown");
}
