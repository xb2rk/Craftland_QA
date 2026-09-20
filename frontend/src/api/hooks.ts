import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "./client.js";
import type {
  AnalysisRun,
  BrowseResult,
  Health,
  ProjectBranch,
  ProjectCommit,
  ProjectInspection,
} from "./types.js";

export function useHealth(): UseQueryResult<Health> {
  return useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 15_000 });
}

export function useAnalyses(limit = 100) {
  return useQuery({
    queryKey: ["analyses", limit],
    queryFn: () => api.listAnalyses(limit),
  });
}

export function useAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: ["analysis", id],
    queryFn: () => api.getAnalysis(id!),
    enabled: id !== undefined && id.length > 0,
    refetchInterval: (query) => {
      const run = query.state.data as AnalysisRun | undefined;
      return run !== undefined && (run.status === "queued" || run.status === "running")
        ? 2000
        : false;
    },
  });
}

export function useInspectMutation() {
  return useMutation({
    mutationFn: (localPath: string) => api.inspect(localPath),
  });
}

export function useQuestions(id: string | undefined) {
  return useQuery({
    queryKey: ["questions", id],
    queryFn: () => api.listQuestions(id!),
    enabled: id !== undefined && id.length > 0,
  });
}

export function useAskQuestionMutation(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => api.askQuestion(id!, question),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["questions", id] });
      void queryClient.invalidateQueries({ queryKey: ["analysis", id] });
    },
  });
}

export function useImportRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: Record<string, unknown>) => api.importRun(run),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["analyses"] }),
  });
}

export function useStartAnalysisMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.startAnalysis,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["analyses"] }),
  });
}

export function useCompareMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.compare,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["analyses"] }),
  });
}

export function useProjectDiffMutation() {
  return useMutation({
    mutationFn: api.projectDiff,
  });
}

export function useWhatIfMutation() {
  return useMutation({
    mutationFn: api.runWhatIf,
  });
}

export function useWriterMutation() {
  return useMutation({
    mutationFn: api.draftWriter,
  });
}

export function useLocalizationMutation() {
  return useMutation({
    mutationFn: api.runLocalization,
  });
}

export function useInspectQuery(localPath: string | undefined) {
  return useQuery<ProjectInspection>({
    queryKey: ["inspect", localPath],
    queryFn: () => api.inspect(localPath!),
    enabled: localPath !== undefined && localPath.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useBranches(localPath: string | undefined) {
  return useQuery<{ branches: ProjectBranch[] }>({
    queryKey: ["branches", localPath],
    queryFn: () => api.branches(localPath!),
    enabled: localPath !== undefined && localPath.length > 0,
    staleTime: 30_000,
  });
}

export function useCommitSearch(
  localPath: string | undefined,
  search: string,
  enabled = true,
) {
  return useQuery<{ commits: ProjectCommit[] }>({
    queryKey: ["commits", localPath, search],
    queryFn: () =>
      api.commits(
        localPath!,
        search.trim().length > 0 ? search.trim() : undefined,
        50,
      ),
    enabled: enabled && localPath !== undefined && localPath.length > 0,
    staleTime: 30_000,
  });
}

export function useBrowse(currentPath: string | null | undefined) {
  return useQuery<BrowseResult>({
    queryKey: ["browse", currentPath ?? ""],
    queryFn: () =>
      api.browse(
        currentPath === null || currentPath === undefined || currentPath === ""
          ? undefined
          : currentPath,
      ),
    staleTime: 10_000,
    retry: 1,
  });
}

export type { AnalysisRun, Health, ProjectInspection };
