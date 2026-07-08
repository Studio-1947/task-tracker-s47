import { useQuery } from '@tanstack/react-query';
import type { AdminDashboard, MemberDashboard } from '@task-tracker/shared';
import { http } from '../lib/api';

export function useAdminDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => http.get<AdminDashboard>('/admin/dashboard'),
    enabled,
  });
}

export function useMemberDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: () => http.get<MemberDashboard>('/me/dashboard'),
    enabled,
  });
}
