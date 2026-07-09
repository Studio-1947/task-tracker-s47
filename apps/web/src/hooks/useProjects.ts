import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectInput, ProjectSummary, UpdateProjectInput } from '@task-tracker/shared';
import { http } from '../lib/api';

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => http.get<ProjectSummary[]>(`/workspaces/${workspaceId}/projects`),
    enabled: !!workspaceId,
  });
}

export function useCreateProject(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      http.post<ProjectSummary>(`/workspaces/${workspaceId}/projects`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useUpdateProject(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProjectInput }) =>
      http.patch<ProjectSummary>(`/projects/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}
