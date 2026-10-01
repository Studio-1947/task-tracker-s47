import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEntry,
  CreateLinkAttachmentInput,
  CreateSubtaskInput,
  CreateTaskInput,
  Paginated,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskListItem,
  TaskSubmission,
  SubmitTaskInput,
  ReviewTaskInput,
  ReviewQueueItem,
  DelegateReviewInput,
  UpdateTaskInput,
  UserRef,
  WorkspaceSummary,
} from '@task-tracker/shared';
import { http } from '../lib/api';

export interface TaskFilters {
  status?: string;
  projectId?: string;
  assigneeId?: string;
  labelId?: string;
  search?: string;
  attention?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
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

export type WorkspaceMember = UserRef & { role: string; workspaceRole?: string; isActive: boolean };

export function useWorkspaceMembers(id: string) {
  return useQuery({
    queryKey: ['workspace', id, 'members'],
    queryFn: () => http.get<WorkspaceMember[]>(`/workspaces/${id}/members`),
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

export function useTaskSubmissions(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'submissions'],
    queryFn: () => http.get<TaskSubmission[]>(`/tasks/${taskId}/submissions`),
    enabled: !!taskId,
  });
}

export function useSubmitTask(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitTaskInput) => http.post<TaskSubmission>(`/tasks/${taskId}/submissions`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'submissions'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
      qc.invalidateQueries({ queryKey: ['review-queue'] });
    },
  });
}

export function useReviewTask(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, input }: { submissionId: string; input: ReviewTaskInput }) =>
      http.post<TaskSubmission>(`/tasks/${taskId}/submissions/${submissionId}/review`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'submissions'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
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
    mutationFn: (id: string) => http.post<{ id: string; isArchived: boolean }>(`/tasks/${id}/archive`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
      qc.invalidateQueries({ queryKey: ['task', id] });
    },
  });
}

export function useRestoreTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post<{ id: string; isArchived: boolean }>(`/tasks/${id}/restore`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
      qc.invalidateQueries({ queryKey: ['task', id] });
    },
  });
}

/** Permanent, irreversible delete — admin-only (enforced server-side). */
export function useDeleteTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<{ id: string }>(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }),
  });
}

export function useCreateSubtask(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubtaskInput) => http.post<TaskDetail>(`/tasks/${taskId}/subtasks`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }); // subtaskCount on the parent row
    },
  });
}

export function useTaskAttachments(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'attachments'],
    queryFn: () => http.get<TaskAttachment[]>(`/tasks/${taskId}/attachments`),
    enabled: !!taskId,
  });
}

export function useUploadAttachment(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return http.upload<TaskAttachment>(`/tasks/${taskId}/attachments`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }); // attachmentCount
    },
  });
}

/** Attach an external link (Figma, Docs, …) rather than uploading bytes. */
export function useAddLinkAttachment(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLinkAttachmentInput) =>
      http.post<TaskAttachment>(`/tasks/${taskId}/attachments/links`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] }); // attachmentCount
    },
  });
}

export function useDeleteAttachment(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      http.del<{ id: string }>(`/tasks/${taskId}/attachments/${attachmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => http.post<TaskComment>(`/tasks/${taskId}/comments`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/* ── Time entries & Timers (E01) ── */
export interface TimeSummary {
  entries: Array<{
    id: string;
    workDate: string;
    durationMinutes: number;
    category: string;
    note?: string;
    startedAt?: string;
    endedAt?: string;
    isPaused: boolean;
    pausedAt?: string | null;
    pausedMs?: number;
    userId: string;
    userName: string;
  }>;
  actualEffortMinutes: number;
  baselineEstimateMinutes: number | null;
  currentEstimateMinutes: number | null;
  remainingEstimateMinutes: number | null;
  forecastTotalMinutes: number;
  forecastVarianceMinutes: number;
}

export function useTimeSummary(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'time-entries'],
    queryFn: () => http.get<TimeSummary>(`/tasks/${taskId}/time-entries`),
    enabled: !!taskId,
  });
}

export function useLogTimeEntry(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workDate: string; durationMinutes: number; startedAt?: string; category?: string; note?: string }) =>
      http.post(`/tasks/${taskId}/time-entries`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'time-entries'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useStartTimer(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { category?: string; note?: string }) =>
      http.post(`/tasks/${taskId}/timer/start`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'time-entries'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useStopTimer(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http.post(`/tasks/${taskId}/timer/stop`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'time-entries'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

/* ── Blockers & Dependencies (P01) ── */
export interface TaskBlockerRow {
  id: string;
  reason: string;
  unblocker: UserRef | null;
  blockedAt: string;
  unblockedAt: string | null;
  nextFollowUpAt: string | null;
}

export function useTaskBlockers(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'blockers'],
    queryFn: () => http.get<TaskBlockerRow[]>(`/tasks/${taskId}/blockers`),
    enabled: !!taskId,
  });
}

export function useAddBlocker(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason: string; unblockerUserId: string; nextFollowUpAt?: string }) =>
      http.post(`/tasks/${taskId}/blockers`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'blockers'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useUnblockTask(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blockerId: string) => http.post(`/tasks/blockers/${blockerId}/unblock`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'blockers'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useAddDependency(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { predecessorTaskId: string; successorTaskId: string; isBlocking?: boolean }) =>
      http.post('/tasks/dependencies', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useRemoveDependency(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dependencyId: string) => http.del(`/tasks/dependencies/${dependencyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

/* ── Dependencies list, reopen (spec §3, §5) ── */
export interface TaskDependencyRow {
  id: string;
  /** WAITS_ON: this task is the successor; BLOCKS: this task is the predecessor. */
  direction: 'WAITS_ON' | 'BLOCKS';
  isBlocking: boolean;
  task: { id: string; ref: string; title: string; status: string };
}

export function useTaskDependencies(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'dependencies'],
    queryFn: () => http.get<TaskDependencyRow[]>(`/tasks/${taskId}/dependencies`),
    enabled: !!taskId,
  });
}

export function useAddTaskDependency(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { predecessorTaskId: string; successorTaskId: string; isBlocking: boolean }) =>
      http.post('/tasks/dependencies', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'dependencies'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
    },
  });
}

export function useRemoveTaskDependency(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dependencyId: string) => http.del(`/tasks/dependencies/${dependencyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'dependencies'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
    },
  });
}

export function useReopenTask(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => http.post(`/tasks/${taskId}/reopen`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'submissions'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export type EstimateClassification = 'SCOPE_CHANGE' | 'PLANNING_CORRECTION' | 'CLIENT_CHANGE' | 'INTERNAL_CHANGE';

export function useReviseEstimate(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { revisedEstimateMinutes: number; reason: string; classification: EstimateClassification }) =>
      http.post(`/tasks/${taskId}/estimate-revisions`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'time-entries'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useAllocateTimeEntry(taskId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, ...input }: { entryId: string; targetTaskId: string; durationMinutes: number; reason: string }) =>
      http.post(`/tasks/${taskId}/time-entries/${entryId}/allocate`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'time-entries'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
    },
  });
}

export function useReviewQueue() {
  return useQuery({
    queryKey: ['review-queue'],
    queryFn: () => http.get<ReviewQueueItem[]>('/review-queue'),
    refetchInterval: 60_000,
  });
}

export function useTaskDelegations(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId, 'delegations'],
    queryFn: () =>
      http.get<
        { id: string; delegator: UserRef; delegate: UserRef; effectiveFrom: string; effectiveTo: string; reason: string; createdAt: string }[]
      >(`/tasks/${taskId}/delegations`),
    enabled: !!taskId,
  });
}

export function useDelegateReview(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DelegateReviewInput) => http.post(`/tasks/${taskId}/delegate-review`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'delegations'] });
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] });
      qc.invalidateQueries({ queryKey: ['review-queue'] });
    },
  });
}

export function usePauseResumeTimer(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'pause' | 'resume') => http.post(`/tasks/${taskId}/timer/${action}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'time-entries'] });
    },
  });
}
