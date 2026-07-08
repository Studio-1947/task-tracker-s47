import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLabelInput, LabelRef } from '@task-tracker/shared';
import { http } from '../lib/api';

export function useLabels(workspaceId: string) {
  return useQuery({
    queryKey: ['labels', workspaceId],
    queryFn: () => http.get<LabelRef[]>(`/workspaces/${workspaceId}/labels`),
  });
}

export function useCreateLabel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLabelInput) => http.post<LabelRef>(`/workspaces/${workspaceId}/labels`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels', workspaceId] }),
  });
}

export function useDeleteLabel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<{ id: string }>(`/labels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels', workspaceId] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}
