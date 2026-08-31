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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      // Deactivating somebody changes how they read in every workspace member
      // list, which is keyed ['workspace', id, …] — note the singular.
      void qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}

/**
 * Removes a person from the org. The call drops their workspace memberships,
 * releases their task assignments, kills their sessions and — when nothing
 * references them — deletes the row along with any meeting cards they owned.
 *
 * So a lot of already-rendered lists are now wrong, and the singular
 * `['workspace', …]` prefix matters: it is what the member list of an open
 * workspace drawer is keyed under. Invalidating only the plural `['workspaces']`
 * left removed people sitting in that list until a full page reload.
 */
export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<RemovedUser>(`/users/${id}`),
    onSuccess: () => {
      for (const key of [
        ['users'],
        ['workspace'],
        ['workspaces'],
        ['tasks'],
        ['sessions'],
        ['meeting-board'],
        ['meeting-weeks'],
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
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
