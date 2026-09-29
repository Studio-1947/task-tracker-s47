import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReservedTimeInput, UnallocatedWorkItem, UserRef } from '@task-tracker/shared';
import { http } from '../lib/api';

export interface WeeklyCapacityRow {
  user: UserRef;
  scheduledMinutes: number;
  excludedMinutes: number;
  availableMinutes: number;
  allocatedMinutes: number;
  overloadMinutes: number;
  utilisationPercent: number | null;
  availabilityLabel: string | null;
  reservedMinutes: number;
  leaveMinutes: number;
}

export interface ReservedTimeRow {
  id: string;
  kind: 'MEETING' | 'TRAINING' | 'OTHER';
  title: string;
  startsAt: string;
  endsAt: string;
}

export function useWeeklyCapacity(workspaceId: string, periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['capacity', workspaceId, periodStart, periodEnd],
    queryFn: () =>
      http.get<WeeklyCapacityRow[]>(`/workspaces/${workspaceId}/capacity-allocations/weekly?periodStart=${periodStart}&periodEnd=${periodEnd}`),
  });
}

export function useUnallocatedWork(workspaceId: string) {
  return useQuery({
    queryKey: ['capacity', workspaceId, 'unallocated'],
    queryFn: () => http.get<UnallocatedWorkItem[]>(`/workspaces/${workspaceId}/capacity-allocations/unallocated`),
  });
}

export function useMyReservedTime(from: string, to: string) {
  return useQuery({
    queryKey: ['reserved-time', from, to],
    queryFn: () => http.get<ReservedTimeRow[]>(`/reserved-time?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
}

export function useReservedTimeMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reserved-time'] });
    qc.invalidateQueries({ queryKey: ['capacity'] });
  };
  return {
    add: useMutation({ mutationFn: (input: ReservedTimeInput) => http.post<ReservedTimeRow>('/reserved-time', input), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => http.del(`/reserved-time/${id}`), onSuccess: refresh }),
  };
}
