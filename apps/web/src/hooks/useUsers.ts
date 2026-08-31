import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatedUserWithTempPassword,
  CreateUserInput,
  RemovedUser,
  UpdateUserInput,
  UserSummary,
  UserSession,
} from '@task-tracker/shared';
import { http } from '../lib/api';

/** Admin-only endpoint — pass `enabled: false` from member-facing screens. */
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => http.get<UserSummary[]>('/users'),
    enabled,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => http.post<CreatedUserWithTempPassword>('/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateUserInput }) =>
      http.patch<UserSummary>(`/users/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

/**
 * Removes a person from the org. Also refreshes workspaces and tasks, since the
 * call drops their memberships and releases their task assignments.
 */
export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<RemovedUser>(`/users/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['workspaces'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (id: string) => http.post<{ tempPassword: string }>(`/users/${id}/reset-password`),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => http.get<UserSession[]>('/users/sessions'),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<{ id: string }>(`/users/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
