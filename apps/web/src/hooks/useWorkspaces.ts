import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateWorkspaceInput, WorkspaceSummary } from '@task-tracker/shared';
import { http } from '../lib/api';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => http.get<WorkspaceSummary[]>('/workspaces'),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => http.post<WorkspaceSummary>('/workspaces', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}
