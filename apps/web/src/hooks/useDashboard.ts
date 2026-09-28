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

export interface OperationalDraftReport {
  reportDate: string;
  workspaceId: string;
  workspaceName: string;
  markdown: string;
  summary: Record<string, unknown>;
}

export function useWednesdayReport(workspaceId: string | null) {
  return useQuery({
    queryKey: ['reports', 'wednesday', workspaceId],
    queryFn: () => http.get<OperationalDraftReport>(`/reports/wednesday?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });
}

export function useFridayReport(workspaceId: string | null) {
  return useQuery({
    queryKey: ['reports', 'friday', workspaceId],
    queryFn: () => http.get<OperationalDraftReport>(`/reports/friday?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });
}

