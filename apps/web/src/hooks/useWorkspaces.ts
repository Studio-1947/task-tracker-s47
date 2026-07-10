import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  UpdateWorkspaceMembersInput,
  WorkspaceSummary,
} from '@task-tracker/shared';
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

export function useUpdateWorkspace(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) =>
      http.patch<WorkspaceSummary>(`/workspaces/${workspaceId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });
}

/** Upload a workspace logo (admin only, enforced server-side). */
export function useUploadWorkspaceLogo(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return http.upload<WorkspaceSummary>(`/workspaces/${workspaceId}/logo`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });
}

/** Remove a workspace logo (admin only, enforced server-side). */
export function useRemoveWorkspaceLogo(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http.del<WorkspaceSummary>(`/workspaces/${workspaceId}/logo`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });
}

export function useUpdateWorkspaceMembers(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkspaceMembersInput) =>
      http.post<{ memberCount: number }>(`/workspaces/${workspaceId}/members`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId, 'members'] });
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
