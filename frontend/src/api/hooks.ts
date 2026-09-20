import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "./client.js";
import type { AnalysisRun, Health, ProjectInspection } from "./types.js";

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

export type { AnalysisRun, Health, ProjectInspection };
