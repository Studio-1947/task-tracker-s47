import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatedUserWithTempPassword,
  CreateUserInput,
  UpdateUserInput,
  UserSummary,
} from '@task-tracker/shared';
import { http } from '../lib/api';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => http.get<UserSummary[]>('/users'),
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

export function useResetPassword() {
  return useMutation({
    mutationFn: (id: string) => http.post<{ tempPassword: string }>(`/users/${id}/reset-password`),
  });
}
