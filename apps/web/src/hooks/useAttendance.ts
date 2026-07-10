import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendancePunchInput,
  AttendanceRecordItem,
  AttendanceToday,
  AttendanceWithUser,
  CreateLeaveRequestInput,
  CreateLeaveTypeInput,
  LeaveBalance,
  LeaveRequestItem,
  LeaveType,
  ReviewLeaveRequestInput,
  SetLeaveBalancesInput,
  UpdateLeaveTypeInput,
} from '@task-tracker/shared';
import { http } from '../lib/api';

/* ── leave types ── */
export function useLeaveTypes() {
  return useQuery({
    queryKey: ['leave-types'],
    queryFn: () => http.get<LeaveType[]>('/leave-types'),
  });
}

export function useCreateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeaveTypeInput) => http.post<LeaveType>('/leave-types', input),
    onSuccess: () => invalidateLeave(qc),
  });
}

export function useUpdateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateLeaveTypeInput }) =>
      http.patch<LeaveType>(`/leave-types/${id}`, patch),
    onSuccess: () => invalidateLeave(qc),
  });
}

export function useDeleteLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<{ ok: true }>(`/leave-types/${id}`),
    onSuccess: () => invalidateLeave(qc),
  });
}

/* ── attendance ── */
export function useAttendanceToday() {
  return useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => http.get<AttendanceToday>('/attendance/today'),
  });
}

export function useMyAttendance(month: string) {
  return useQuery({
    queryKey: ['attendance', 'me', month],
    queryFn: () => http.get<AttendanceRecordItem[]>(`/attendance/me?month=${month}`),
  });
}

export function useTeamLog(date: string) {
  return useQuery({
    queryKey: ['attendance', 'team', date],
    queryFn: () => http.get<AttendanceWithUser[]>(`/attendance/team?date=${date}`),
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (geo: AttendancePunchInput) => http.post<AttendanceRecordItem>('/attendance/check-in', geo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (geo: AttendancePunchInput) => http.post<AttendanceRecordItem>('/attendance/check-out', geo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

/* ── leave requests ── */
export function useMyLeaves() {
  return useQuery({
    queryKey: ['leaves', 'me'],
    queryFn: () => http.get<LeaveRequestItem[]>('/leaves/me'),
  });
}

export function useLeaves(status?: string) {
  return useQuery({
    queryKey: ['leaves', 'all', status ?? 'ALL'],
    queryFn: () => http.get<LeaveRequestItem[]>(`/leaves${status ? `?status=${status}` : ''}`),
  });
}

export function useCreateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeaveRequestInput) => http.post<LeaveRequestItem>('/leaves', input),
    onSuccess: () => invalidateLeave(qc),
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post<LeaveRequestItem>(`/leaves/${id}/cancel`, {}),
    onSuccess: () => invalidateLeave(qc),
  });
}

export function useReviewLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, review }: { id: string; review: ReviewLeaveRequestInput }) =>
      http.post<LeaveRequestItem>(`/leaves/${id}/review`, review),
    onSuccess: () => invalidateLeave(qc),
  });
}

/* ── balances ── */
export function useMyBalances() {
  return useQuery({
    queryKey: ['leaves', 'balances', 'me'],
    queryFn: () => http.get<LeaveBalance[]>('/leaves/balances/me'),
  });
}

export function useUserBalances(userId: string | null) {
  return useQuery({
    queryKey: ['leaves', 'balances', 'user', userId],
    queryFn: () => http.get<LeaveBalance[]>(`/leaves/balances/user/${userId}`),
    enabled: !!userId,
  });
}

export function useSetUserBalances(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetLeaveBalancesInput) =>
      http.put<LeaveBalance[]>(`/leaves/balances/user/${userId}`, input),
    onSuccess: () => invalidateLeave(qc),
  });
}

function invalidateLeave(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['leaves'] });
  qc.invalidateQueries({ queryKey: ['leave-types'] });
}
