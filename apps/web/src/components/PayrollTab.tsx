import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, http } from '../lib/api';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../stores/auth';
import { formatWorkingDuration } from '../lib/format';
import { Badge, Button, Card, EmptyState, Spinner } from './ui';

interface Statement {
  id: string;
  userId: string;
  month: string;
  version: number;
  policyVersion: number;
  scheduledMinutes: number;
  workedMinutes: number;
  paidLeaveMinutes: number;
  payableMinutes: number;
  payablePercentage: string | number | null;
  status: 'DRAFT' | 'REVIEWED' | 'APPROVED';
  preparedById: string;
  reviewedById: string | null;
  approvedById: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  reopenedReason: string | null;
}

const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-[#252525] dark:text-white';
const errMsg = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Something went wrong');
const thisMonth = () => new Date().toISOString().slice(0, 7);

/**
 * Attendance-derived payroll inputs (spec section 8). The payable indicator is
 * labelled as attendance, never as performance or a salary multiplier, and moves
 * draft, second-admin review, approval; the preparer cannot review or approve.
 */
export function PayrollTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: users = [] } = useUsers();
  const [month, setMonth] = useState(thisMonth());
  const [userId, setUserId] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['payroll', month],
    queryFn: () => http.get<Statement[]>(`/admin/payroll/statements?month=${month}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });
  const draft = useMutation({ mutationFn: () => http.post('/admin/payroll/statements', { userId, month }), onSuccess: () => { setUserId(''); void refresh(); } });
  const act = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'review' | 'approve' | 'reopen'; note: string }) =>
      http.post(`/admin/payroll/statements/${id}/${action}`, { note }),
    onSuccess: () => void refresh(),
  });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Unknown';
  const actionError = draft.error ?? act.error;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Payroll inputs</h2>
        <p className="mt-1 text-xs text-slate-500">
          Attendance and payable indicator only. This is not a performance score and not a salary multiplier; payroll treatment follows the approved policy and admin sign-off.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_auto]">
          <input aria-label="Payroll month" type="month" className={field} value={month} onChange={(e) => setMonth(e.target.value)} />
          <select aria-label="Employee" className={field} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Prepare a draft for…</option>
            {users.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <Button disabled={!userId || !month || draft.isPending} onClick={() => draft.mutate()}>Prepare draft</Button>
        </div>
        {actionError ? <p role="alert" className="mt-2 text-sm text-red-600">{errMsg(actionError)}</p> : null}
      </Card>

      {isLoading ? <Spinner /> : error ? <p className="text-sm text-red-600">{errMsg(error)}</p> : null}
      {rows && rows.length === 0 ? <EmptyState title="No statements for this month" hint="Prepare a draft for an employee above." /> : null}
      {(rows ?? []).map((s) => {
        const pct = s.payablePercentage === null ? null : Number(s.payablePercentage);
        const mine = s.preparedById === user?.id;
        const note = notes[s.id] ?? '';
        return (
          <Card key={s.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-100">{nameOf(s.userId)} · {s.month} <span className="text-xs font-normal text-slate-400">v{s.version} · policy v{s.policyVersion}</span></div>
                <div className="mt-0.5 text-xs text-slate-500">Prepared by {nameOf(s.preparedById)}{s.reviewedById ? ` · reviewed by ${nameOf(s.reviewedById)}` : ''}{s.approvedById ? ` · approved by ${nameOf(s.approvedById)}` : ''}</div>
              </div>
              <Badge tone={s.status === 'APPROVED' ? 'green' : s.status === 'REVIEWED' ? 'amber' : 'slate'}>{s.status.toLowerCase()}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Scheduled</dt><dd className="font-bold tabular-nums">{formatWorkingDuration(s.scheduledMinutes)}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Worked</dt><dd className="font-bold tabular-nums">{formatWorkingDuration(s.workedMinutes)}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Paid leave</dt><dd className="font-bold tabular-nums">{formatWorkingDuration(s.paidLeaveMinutes)}</dd></div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Attendance indicator</dt>
                <dd className="font-bold tabular-nums">{pct === null ? 'Not applicable' : `${pct}%`}</dd>
                <dd className="text-[11px] text-slate-500">{formatWorkingDuration(s.payableMinutes)} payable of {formatWorkingDuration(s.scheduledMinutes)} scheduled</dd>
              </div>
            </dl>
            {s.reopenedReason && s.status === 'DRAFT' ? <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Reopened: {s.reopenedReason}</p> : null}
            <div className="mt-3 space-y-2">
              {s.status !== 'DRAFT' || !mine ? (
                <input aria-label={`Note for ${nameOf(s.userId)} statement`} className={field} placeholder={s.status === 'APPROVED' ? 'Reason to reopen' : 'Decision note (required)'} value={note} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {s.status === 'DRAFT' ? (
                  mine ? <span className="text-xs text-slate-500">A different administrator must review this draft.</span>
                       : <Button disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ id: s.id, action: 'review', note: note.trim() })}>Mark reviewed</Button>
                ) : null}
                {s.status === 'REVIEWED' ? (
                  mine ? <span className="text-xs text-slate-500">The preparer cannot approve.</span>
                       : <Button disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ id: s.id, action: 'approve', note: note.trim() })}>Approve</Button>
                ) : null}
                {s.status === 'APPROVED' ? <Button variant="danger" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ id: s.id, action: 'reopen', note: note.trim() })}>Reopen with reason</Button> : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
