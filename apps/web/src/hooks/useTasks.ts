import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEntry,
  CreateTaskInput,
  Paginated,
  TaskComment,
  TaskDetail,
  TaskListItem,
  UpdateTaskInput,
  UserRef,
  WorkspaceSummary,
} from '@task-tracker/shared';
import { http } from '../lib/api';

export interface TaskFilters {
  status?: string;
  assigneeId?: string;
  labelId?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

function toQueryString(filters: TaskFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => http.get<WorkspaceSummary>(`/workspaces/${id}`),
  });
}

export function useWorkspaceMembers(id: string) {
  return useQuery({
    queryKey: ['workspace', id, 'members'],
    queryFn: () => http.get<(UserRef & { role: string })[]>(`/workspaces/${id}/members`),
  });
}

export function useTasks(workspaceId: string, filters: TaskFilters) {
  return useQuery({
    queryKey: ['tasks', workspaceId, filters],
    queryFn: () =>
      http.get<Paginated<TaskListItem>>(`/workspaces/${workspaceId}/tasks${toQueryString(filters)}`),
  });
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => http.get<TaskDetail>(`/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'comments'],
    queryFn: () => http.get<TaskComment[]>(`/tasks/${taskId}/comments`),
    enabled: !!taskId,
  });
}

export function useTaskHistory(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'history'],
    queryFn: () => http.get<AuditEntry[]>(`/tasks/${taskId}/history`),
    enabled: !!taskId,
  });
}

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => http.post<TaskDetail>(`/workspaces/${workspaceId}/tasks`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }),
  });
}

export function useUpdateTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      http.patch<TaskDetail>(`/tasks/${id}`, patch),
    // Optimistic: patch the task in every cached list immediately (critical for
    // drag-and-drop Kanban feel), roll back on error, reconcile on settle.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tasks', workspaceId] });
      const snapshots = qc.getQueriesData<Paginated<TaskListItem>>({ queryKey: ['tasks', workspaceId] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<Paginated<TaskListItem>>(key, {
          ...data,
          items: data.items.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...(patch.status !== undefined ? { status: patch.status } : {}),
                  ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
                }
              : t,
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
      if (task) qc.invalidateQueries({ queryKey: ['task', task.id] });
    },
  });
}

export function useArchiveTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<{ id: string }>(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }),
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => http.post<TaskComment>(`/tasks/${taskId}/comments`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
    },
  });
}
