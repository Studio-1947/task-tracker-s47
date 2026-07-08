import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatedUserWithTempPassword, CreateUserInput, UserSummary } from '@task-tracker/shared';
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
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      http.patch<UserSummary>(`/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
