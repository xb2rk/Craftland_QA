export interface SavedProject {
  id: string;
  name: string;
  localPath: string;
  addedAt: string;
  lastGoal?: string;
  lastBaseRef?: string;
  lastCurrentRef?: string;
  lastLens?: string;
}

const PROJECTS_KEY = "cqa.projects.v1";
const ACTIVE_KEY = "cqa.activeProject.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadSavedProjects(): SavedProject[] {
  const list = readJson<SavedProject[]>(PROJECTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveSavedProjects(projects: SavedProject[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function loadActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveProjectId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_KEY);
  } else {
    localStorage.setItem(ACTIVE_KEY, id);
  }
}

export function projectNameFromPath(localPath: string): string {
  const trimmed = localPath.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function newProjectId(): string {
  const cryptoObject = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  return `project-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
