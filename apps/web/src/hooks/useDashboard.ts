import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminDashboard, MemberDashboard } from '@task-tracker/shared';
import { http } from '../lib/api';

export function useAdminDashboard(enabled: boolean, workspaceId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'admin', workspaceId ?? 'all'],
    queryFn: () => http.get<AdminDashboard>(`/admin/dashboard${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
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

export interface OperationalReportSnapshot {
  id: string;
  workspaceId: string;
  reportType: 'WEDNESDAY_PROGRESS' | 'FRIDAY_OUTCOMES';
  reportDate: string;
  status: 'DRAFT' | 'APPROVED' | 'DISTRIBUTED';
  recipientIds: string[];
  approvedAt: string | null;
  distributedAt: string | null;
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

export function useCreateReportDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workspaceId: string; reportType: 'WEDNESDAY_PROGRESS' | 'FRIDAY_OUTCOMES' }) =>
      http.post<OperationalReportSnapshot>('/reports/drafts', input),
    onSuccess: (row) => qc.invalidateQueries({ queryKey: ['reports', 'snapshots', row.workspaceId] }),
  });
}

export function useApproveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post<OperationalReportSnapshot>(`/reports/${id}/approve`, {}),
    onSuccess: (row) => qc.invalidateQueries({ queryKey: ['reports', 'snapshots', row.workspaceId] }),
  });
}

export function useDistributeReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post<OperationalReportSnapshot & { delivered: number }>(`/reports/${id}/distribute`, {}),
    onSuccess: (row) => qc.invalidateQueries({ queryKey: ['reports', 'snapshots', row.workspaceId] }),
  });
}
