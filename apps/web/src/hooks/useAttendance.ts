import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceDayStateItem,
  AttendancePunchInput,
  AttendanceRecordItem,
  AttendanceToday,
  AttendanceWithUser,
  AttendanceTimingItem,
  AttendanceTimingOverview,
  CreateLeaveRequestInput,
  CreateLeaveTypeInput,
  LeaveBalance,
  LeaveRequestItem,
  LeaveType,
  ReviewLeaveRequestInput,
  SetLeaveBalancesInput,
  UpdateLeaveTypeInput,
  CreateCompOffRequestInput,
  ReviewCompOffRequestInput,
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

export function useImportLeavePolicyPdf() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return http.upload<Partial<LeaveType>[]>('/leave-types/import-pdf', fd);
    },
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

export function useMyAttendanceTiming(month: string) {
  return useQuery({
    queryKey: ['attendance', 'timing', 'me', month],
    queryFn: () => http.get<AttendanceTimingItem[]>(`/attendance/timing/me?month=${month}`),
  });
}

export function useAttendanceTimingOverview(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ['attendance', 'timing', 'overview', month],
    queryFn: () => http.get<AttendanceTimingOverview>(`/attendance/timing/overview?month=${month}`),
    enabled,
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (geo: AttendancePunchInput) => http.post<AttendanceRecordItem>('/attendance/check-in', geo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['leave-types'] });
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

/* ── attendance corrections (H01) ── */
export interface AttendanceCorrectionItem {
  id: string;
  attendanceRecordId?: string;
  workDate: string;
  proposedCheckInAt: string;
  proposedCheckOutAt: string;
  reason: string;
  status: string;
  user: { id: string; name: string; email: string; avatarKey?: string | null };
  reviewer?: { id: string; name: string; email: string; avatarKey?: string | null } | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export function useMyCorrections() {
  return useQuery({
    queryKey: ['attendance', 'corrections', 'me'],
    queryFn: () => http.get<AttendanceCorrectionItem[]>('/attendance/corrections/me'),
  });
}

export function useListCorrections(status?: string) {
  return useQuery({
    queryKey: ['attendance', 'corrections', 'all', status ?? 'ALL'],
    queryFn: () => http.get<AttendanceCorrectionItem[]>(`/attendance/corrections${status ? `?status=${status}` : ''}`),
  });
}

export function useRequestCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workDate: string; proposedCheckInAt: string; proposedCheckOutAt: string; reason: string }) =>
      http.post<AttendanceCorrectionItem>('/attendance/corrections', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useReviewCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { status: 'APPROVED' | 'REJECTED'; note?: string } }) =>
      http.post<AttendanceCorrectionItem[]>(`/attendance/corrections/${id}/review`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

function invalidateLeave(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['leaves'] });
  qc.invalidateQueries({ queryKey: ['leave-types'] });
}

export function useMyDayStates(month: string) {
  return useQuery({
    queryKey: ['attendance', 'day-states', month],
    queryFn: () => http.get<AttendanceDayStateItem[]>(`/attendance/day-states?month=${month}`),
  });
}

export interface TeamAvailability {
  from: string;
  to: string;
  dates: string[];
  people: Array<{ user: { id: string; name: string; email: string; avatarKey: string | null }; days: AttendanceDayStateItem[] }>;
}

export function useTeamAvailability(from: string, to: string) {
  return useQuery({
    queryKey: ['attendance', 'team-availability', from, to],
    queryFn: () => http.get<TeamAvailability>(`/attendance/team-availability?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });
}

export function useCanViewTeamAvailability() {
  return useQuery({
    queryKey: ['attendance', 'team-availability', 'access'],
    queryFn: () => http.get<{ allowed: boolean }>('/attendance/team-availability/access'),
    staleTime: 5 * 60_000,
  });
}

/* ── Comp Off Requests ── */
export interface CompOffItem {
  id: string;
  workDate: string;
  reason: string;
  earnedDays: string;
  status: string;
  createdAt: string;
  user?: { id: string; name: string; email?: string; avatarKey?: string | null };
}

export function useMyCompOffs() {
  return useQuery({
    queryKey: ['attendance', 'comp-off', 'me'],
    queryFn: () => http.get<CompOffItem[]>('/attendance/comp-off/me'),
  });
}

export function useListAllCompOffs(status?: string) {
  return useQuery({
    queryKey: ['attendance', 'comp-off', 'all', status ?? 'ALL'],
    queryFn: () => http.get<CompOffItem[]>(`/attendance/comp-off${status ? `?status=${status}` : ''}`),
  });
}

export function useRequestCompOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCompOffRequestInput) =>
      http.post<CompOffItem>('/attendance/comp-off', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance', 'comp-off'] });
    },
  });
}

export function useReviewCompOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReviewCompOffRequestInput }) =>
      http.post<{ success: boolean }>(`/attendance/comp-off/${id}/review`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance', 'comp-off'] });
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['leave-types'] });
    },
  });
}
