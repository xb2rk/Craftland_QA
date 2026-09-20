import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  loadActiveProjectId,
  loadSavedProjects,
  saveActiveProjectId,
  saveSavedProjects,
  type SavedProject,
} from "../projects/registry.js";

interface ProjectContextValue {
  projects: SavedProject[];
  active: SavedProject | null;
  addProject: (project: SavedProject) => void;
  removeProject: (id: string) => void;
  setActive: (id: string | null) => void;
  updateProject: (id: string, patch: Partial<SavedProject>) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [projects, setProjects] = useState<SavedProject[]>(() => loadSavedProjects());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveProjectId());

  const persist = useCallback((next: SavedProject[]) => {
    setProjects(next);
    saveSavedProjects(next);
  }, []);

  const addProject = useCallback(
    (project: SavedProject) => {
      persist([...projects.filter((item) => item.id !== project.id), project]);
      setActiveId(project.id);
      saveActiveProjectId(project.id);
    },
    [persist, projects],
  );

  const removeProject = useCallback(
    (id: string) => {
      const next = projects.filter((item) => item.id !== id);
      persist(next);
      if (activeId === id) {
        const fallback = next.length > 0 ? next[next.length - 1].id : null;
        setActiveId(fallback);
        saveActiveProjectId(fallback);
      }
    },
    [activeId, persist, projects],
  );

  const setActive = useCallback((id: string | null) => {
    setActiveId(id);
    saveActiveProjectId(id);
  }, []);

  const updateProject = useCallback(
    (id: string, patch: Partial<SavedProject>) => {
      persist(projects.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [persist, projects],
  );

  const active = useMemo(
    () => projects.find((item) => item.id === activeId) ?? null,
    [projects, activeId],
  );

  const value = useMemo(
    () => ({ projects, active, addProject, removeProject, setActive, updateProject }),
    [projects, active, addProject, removeProject, setActive, updateProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (value === null) throw new Error("useProjects must be used inside ProjectProvider.");
  return value;
}
