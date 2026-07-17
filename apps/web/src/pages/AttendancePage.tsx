import { useMemo, useState } from 'react';
import type { AttendancePunchInput, LeaveBalance, LeaveRequestItem } from '@task-tracker/shared';
import { useAuth } from '../stores/auth';
import { ApiRequestError } from '../lib/api';
import { useUsers } from '../hooks/useUsers';
import { Avatar } from '../components/Avatar';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';
import {
  useAttendanceToday,
  useCancelLeave,
  useCheckIn,
  useCheckOut,
  useCreateLeave,
  useCreateLeaveType,
  useDeleteLeaveType,
  useLeaves,
  useLeaveTypes,
  useMyAttendance,
  useMyBalances,
  useMyLeaves,
  useReviewLeave,
  useSetUserBalances,
  useTeamLog,
  useUpdateLeaveType,
  useUserBalances,
} from '../hooks/useAttendance';

/* ── helpers ── */
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function fmtHours(inIso: string, outIso: string | null): string {
  if (!outIso) return '—';
  const mins = Math.max(0, Math.round((Date.parse(outIso) - Date.parse(inIso)) / 60000));
  return `${Math.floor(mins / 60)}h ${pad2(mins % 60)}m`;
}

/** Best-effort browser geolocation; resolves to {} if unavailable or denied. */
function getGeo(): Promise<AttendancePunchInput> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => resolve({}),
      { timeout: 8000, enableHighAccuracy: true },
    );
  });
}

const statusTone: Record<string, 'slate' | 'green' | 'amber'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  DECLINED: 'slate',
  CANCELLED: 'slate',
};

type Tab = 'me' | 'approvals' | 'types' | 'allotments' | 'team';

export function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('me');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'me', label: 'My Attendance' },
    ...(isAdmin
      ? ([
          { key: 'approvals', label: 'Approvals' },
          { key: 'types', label: 'Leave Types' },
          { key: 'allotments', label: 'Allotments' },
          { key: 'team', label: 'Team Log' },
        ] as { key: Tab; label: string }[])
      : []),
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Attendance</h1>

      <div className="mt-5 flex gap-1.5 overflow-x-auto border-b border-slate-150 dark:border-slate-800 pb-px">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'text-indigo-700 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-500'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border-b-2 border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'me' ? <MyAttendanceTab /> : null}
        {tab === 'approvals' ? <ApprovalsTab /> : null}
        {tab === 'types' ? <LeaveTypesTab /> : null}
        {tab === 'allotments' ? <AllotmentsTab /> : null}
        {tab === 'team' ? <TeamLogTab /> : null}
      </div>
    </div>
  );
}

/* ── My Attendance ── */
function MyAttendanceTab() {
  const [showRequest, setShowRequest] = useState(false);
  return (
    <div className="space-y-6">
      <CheckInCard />
      <BalancesRow />
      <MonthCalendar />
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">My leave requests</h2>
          <Button className="py-2 px-4 text-xs" onClick={() => setShowRequest(true)}>
            Request leave
          </Button>
        </div>
        <MyLeavesList />
      </section>
      {showRequest ? <RequestLeaveModal onClose={() => setShowRequest(false)} /> : null}
    </div>
  );
}

function CheckInCard() {
  const { data, isLoading } = useAttendanceToday();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const punch = async (kind: 'in' | 'out') => {
    setError(null);
    setLocating(true);
    const geo = await getGeo();
    setLocating(false);
    const m = kind === 'in' ? checkIn : checkOut;
    m.mutate(geo, { onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Something went wrong') });
  };

  const rec = data?.record;
  const busy = locating || checkIn.isPending || checkOut.isPending;

  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Punch label="Checked in" value={rec?.checkInAt ? fmtTime(rec.checkInAt) : '—'} loc={rec?.checkInLocation ?? null} />
            <Punch label="Checked out" value={rec?.checkOutAt ? fmtTime(rec.checkOutAt) : '—'} loc={rec?.checkOutLocation ?? null} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {rec?.checkInAt ? fmtHours(rec.checkInAt, rec.checkOutAt) : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {!data?.checkedIn ? (
              <Button disabled={busy} onClick={() => void punch('in')} className="px-6 py-3 font-semibold">
                {busy ? 'Locating…' : 'Check in'}
              </Button>
            ) : !data?.checkedOut ? (
              <Button variant="danger" disabled={busy} onClick={() => void punch('out')} className="px-6 py-3 font-semibold">
                {busy ? 'Locating…' : 'Check out'}
              </Button>
            ) : (
              <Badge tone="green">Done for today ✓</Badge>
            )}
          </div>
        </div>
      )}
      {error ? <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null}
      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Your location is captured at check-in/out when you allow it — admins can see it. Denying still records the time.
      </p>
    </Card>
  );
}

function Punch({ label, value, loc }: { label: string; value: string; loc: { lat: number; lng: number } | null }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{value}</div>
      {loc ? <MapLink lat={loc.lat} lng={loc.lng} /> : null}
    </div>
  );
}

function MapLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      {lat.toFixed(4)}, {lng.toFixed(4)}
    </a>
  );
}

function BalancesRow() {
  const { data, isLoading } = useMyBalances();
  if (isLoading) return <Spinner />;
  if (!data || data.length === 0) {
    return <EmptyState title="No leave types yet" hint="An admin needs to set up leave types and your balances." />;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {data.map((b) => (
        <BalanceCard key={b.leaveTypeId} b={b} />
      ))}
    </div>
  );
}

function BalanceCard({ b }: { b: LeaveBalance }) {
  const dot = b.color ?? '#6366f1';
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
        <span className="truncate text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{b.typeName}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{b.remaining}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-400 dark:text-slate-500">
        of {b.allotted} left · {b.used} used
      </div>
    </Card>
  );
}

function MonthCalendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const month = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;
  const { data: records } = useMyAttendance(month);
  const { data: leaves } = useMyLeaves();

  const recByDay = useMemo(() => new Map((records ?? []).map((r) => [r.workDate, r])), [records]);
  const leaveByDay = useMemo(() => {
    const map = new Map<string, LeaveRequestItem>();
    for (const l of leaves ?? []) {
      if (l.status !== 'APPROVED') continue;
      for (let d = new Date(`${l.startDate}T00:00:00`); ymd(d) <= l.endDate; d.setDate(d.getDate() + 1)) {
        map.set(ymd(d), l);
      }
    }
    return map;
  }, [leaves]);

  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const todayStr = ymd(new Date());

  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shift = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1">
          <IconBtn label="Previous month" onClick={() => shift(-1)} d="M15 18l-6-6 6-6" />
          <IconBtn label="Next month" onClick={() => shift(1)} d="M9 18l6-6-6-6" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const dateStr = `${month}-${pad2(day)}`;
          const rec = recByDay.get(dateStr);
          const leave = leaveByDay.get(dateStr);
          const isToday = dateStr === todayStr;
          return (
            <div
              key={dateStr}
              className={`min-h-14 rounded-lg border p-1.5 text-left ${
                isToday
                  ? 'border-indigo-400 dark:border-indigo-500/60'
                  : 'border-slate-100 dark:border-slate-800/60'
              } ${leave ? '' : rec ? 'bg-emerald-50/50 dark:bg-emerald-950/15' : ''}`}
              style={leave?.color ? { backgroundColor: `${leave.color}18` } : undefined}
              title={leave ? `${leave.typeName} leave` : rec ? `In ${fmtTime(rec.checkInAt)}${rec.checkOutAt ? ` · Out ${fmtTime(rec.checkOutAt)}` : ''}` : undefined}
            >
              <div className={`text-xs font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{day}</div>
              {leave ? (
                <div className="mt-0.5 truncate text-[9px] font-semibold" style={{ color: leave.color ?? '#6366f1' }}>
                  {leave.halfDay ? '½ ' : ''}{leave.typeName}
                </div>
              ) : rec ? (
                <div className="mt-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {fmtTime(rec.checkInAt)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        <Legend swatch="bg-emerald-400" label="Present" />
        <Legend swatch="bg-indigo-400" label="On leave" />
      </div>
    </Card>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}

function IconBtn({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d={d} />
      </svg>
    </button>
  );
}

function MyLeavesList() {
  const { data, isLoading, error } = useMyLeaves();
  const cancel = useCancelLeave();
  if (isLoading) return <Spinner />;
  if (error) return <ErrorState message="Failed to load leave requests" />;
  if (!data || data.length === 0) return <EmptyState title="No leave requests" hint="Request time off with the button above." />;
  return (
    <div className="space-y-2.5">
      {data.map((l) => (
        <Card key={l.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color ?? '#6366f1' }} />
              <span className="font-semibold text-slate-800 dark:text-slate-100">{l.typeName}</span>
              <Badge tone={statusTone[l.status]}>{l.status}</Badge>
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {l.startDate === l.endDate ? fmtDate(l.startDate) : `${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}`}
              {' · '}{l.halfDay ? 'Half day' : `${l.days} day${l.days === 1 ? '' : 's'}`}
            </div>
            {l.reason ? <div className="mt-1 text-sm text-slate-400 dark:text-slate-500 italic">“{l.reason}”</div> : null}
            {l.reviewNote ? <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Note: {l.reviewNote}</div> : null}
          </div>
          {l.status === 'PENDING' ? (
            <Button variant="ghost" className="shrink-0 py-1.5 px-3 text-xs" disabled={cancel.isPending} onClick={() => cancel.mutate(l.id)}>
              Cancel
            </Button>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function RequestLeaveModal({ onClose }: { onClose: () => void }) {
  const { data: types } = useLeaveTypes();
  const create = useCreateLeave();
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const singleDay = !!startDate && startDate === endDate;
  const noTypes = Array.isArray(types) && types.length === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ leaveTypeId, startDate, endDate, halfDay: singleDay && halfDay, reason: reason || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to submit request');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md p-6 animate-fade-in">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Request leave</h2>
        {noTypes ? (
          <div className="mt-4">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3.5 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              No leave types have been set up yet. An admin needs to add them under <span className="font-semibold">Attendance → Leave Types</span> before you can request leave.
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
        <form className="mt-4 space-y-3.5" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Type</label>
            <select
              required
              aria-label="Leave type"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
            >
              <option value="">Select a type…</option>
              {(types ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">From</label>
              <Input type="date" required value={startDate} onChange={(e) => { setStartDate(e.target.value); if (!endDate || e.target.value > endDate) setEndDate(e.target.value); }} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">To</label>
              <Input type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {singleDay ? (
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} className="rounded" />
              Half day
            </label>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Reason (optional)</label>
            <textarea
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !leaveTypeId}>{create.isPending ? 'Submitting…' : 'Submit'}</Button>
          </div>
        </form>
        )}
      </Card>
    </div>
  );
}

/* ── Admin: Approvals ── */
function ApprovalsTab() {
  const [status, setStatus] = useState('PENDING');
  const { data, isLoading, error } = useLeaves(status || undefined);
  const review = useReviewLeave();
  const [declining, setDeclining] = useState<LeaveRequestItem | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Filter</label>
        <select
          aria-label="Filter by status"
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs dark:text-white"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="DECLINED">Declined</option>
          <option value="">All</option>
        </select>
      </div>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message="Failed to load requests" />
      ) : !data || data.length === 0 ? (
        <EmptyState title="Nothing here" hint="No leave requests match this filter." />
      ) : (
        <div className="space-y-2.5">
          {data.map((l) => (
            <Card key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar user={l.user} size="sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{l.user.name}</span>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color ?? '#6366f1' }} />
                    <span className="text-sm text-slate-500 dark:text-slate-400">{l.typeName}</span>
                    <Badge tone={statusTone[l.status]}>{l.status}</Badge>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {l.startDate === l.endDate ? fmtDate(l.startDate) : `${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}`}
                    {' · '}{l.halfDay ? 'Half day' : `${l.days} day${l.days === 1 ? '' : 's'}`}
                  </div>
                  {l.reason ? <div className="mt-0.5 text-sm italic text-slate-400 dark:text-slate-500">“{l.reason}”</div> : null}
                </div>
              </div>
              {l.status === 'PENDING' ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    className="py-1.5 px-3 text-xs"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: l.id, review: { status: 'APPROVED' } })}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    className="py-1.5 px-3 text-xs"
                    disabled={review.isPending}
                    onClick={() => setDeclining(l)}
                  >
                    Decline
                  </Button>
                </div>
              ) : (
                <div className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                  {l.reviewedBy ? `by ${l.reviewedBy.name}` : ''}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {declining ? (
        <DeclineLeaveModal
          request={declining}
          pending={review.isPending}
          onCancel={() => setDeclining(null)}
          onConfirm={(note) =>
            review.mutate(
              { id: declining.id, review: { status: 'DECLINED', note: note || undefined } },
              { onSuccess: () => setDeclining(null) },
            )
          }
        />
      ) : null}
    </div>
  );
}

function DeclineLeaveModal({
  request,
  pending,
  onCancel,
  onConfirm,
}: {
  request: LeaveRequestItem;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={onCancel} />
      <Card className="relative z-10 w-full max-w-md p-6 animate-fade-in">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Decline leave request</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Declining <span className="font-semibold text-slate-700 dark:text-slate-200">{request.user.name}</span>’s {request.typeName} leave
          {' '}({request.startDate === request.endDate ? fmtDate(request.startDate) : `${fmtDate(request.startDate)} → ${fmtDate(request.endDate)}`}).
        </p>
        <label className="mt-4 mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Reason (optional)</label>
        <textarea
          autoFocus
          rows={3}
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
          placeholder="Shared with the requester…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(note)} disabled={pending}>
            {pending ? 'Declining…' : 'Decline'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ── Admin: Leave Types ── */
function LeaveTypesTab() {
  const { data, isLoading } = useLeaveTypes();
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const del = useDeleteLeaveType();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [defaultBalance, setDefaultBalance] = useState(12);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name, color, defaultBalance });
      setName('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create type');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={add}>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New leave type</label>
            <Input placeholder="e.g. Casual" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Color</label>
            <input aria-label="Color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#252525]" />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Default days</label>
            <Input type="number" min={0} max={365} value={defaultBalance} onChange={(e) => setDefaultBalance(Number(e.target.value))} />
          </div>
          <Button type="submit" disabled={create.isPending || !name} className="py-3 px-5">Add</Button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </Card>

      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No leave types" hint="Create your first leave type above." />
      ) : (
        <div className="space-y-2.5">
          {data.map((t) => (
            <Card key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color ?? '#6366f1' }} />
                <span className="font-semibold text-slate-800 dark:text-slate-100">{t.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Default
                  <input
                    type="number"
                    min={0}
                    max={365}
                    defaultValue={t.defaultBalance}
                    className="w-16 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== t.defaultBalance) update.mutate({ id: t.id, patch: { defaultBalance: v } });
                    }}
                  />
                  days
                </label>
                <Button variant="danger" className="py-1.5 px-3 text-xs" disabled={del.isPending} onClick={() => del.mutate(t.id)}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Admin: Allotments ── */
function AllotmentsTab() {
  const { data: users } = useUsers();
  const [userId, setUserId] = useState<string | null>(null);
  const { data: balances, isLoading } = useUserBalances(userId);
  const setBalances = useSetUserBalances(userId ?? '');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  const activeUsers = (users ?? []).filter((u) => u.isActive);

  const onSelectUser = (id: string) => {
    setUserId(id || null);
    setDraft({});
    setSaved(false);
  };

  const valueFor = (b: LeaveBalance) => draft[b.leaveTypeId] ?? b.allotted;

  const save = () => {
    if (!userId || !balances) return;
    const payload = balances.map((b) => ({ leaveTypeId: b.leaveTypeId, allotted: valueFor(b) }));
    setBalances.mutate({ balances: payload }, { onSuccess: () => { setSaved(true); setDraft({}); } });
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Member</label>
        <select
          aria-label="Select member"
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white sm:max-w-sm"
          value={userId ?? ''}
          onChange={(e) => onSelectUser(e.target.value)}
        >
          <option value="">Select a member…</option>
          {activeUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
      </Card>

      {userId ? (
        isLoading ? (
          <Spinner />
        ) : !balances || balances.length === 0 ? (
          <EmptyState title="No leave types" hint="Create leave types first in the Leave Types tab." />
        ) : (
          <Card className="p-5">
            <div className="space-y-3">
              {balances.map((b) => (
                <div key={b.leaveTypeId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color ?? '#6366f1' }} />
                    <span className="font-medium text-slate-700 dark:text-slate-200">{b.typeName}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">({b.used} used)</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    aria-label={`${b.typeName} allotment`}
                    className="w-24 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    value={valueFor(b)}
                    onChange={(e) => { setDraft((d) => ({ ...d, [b.leaveTypeId]: Number(e.target.value) })); setSaved(false); }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={save} disabled={setBalances.isPending}>{setBalances.isPending ? 'Saving…' : 'Save allotments'}</Button>
              {saved ? <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Saved ✓</span> : null}
            </div>
          </Card>
        )
      ) : (
        <EmptyState title="Pick a member" hint="Select a member to set their leave allotments." />
      )}
    </div>
  );
}

/* ── Admin: Team Log ── */
function TeamLogTab() {
  const [date, setDate] = useState(() => ymd(new Date()));
  const { data, isLoading, error } = useTeamLog(date);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Date</label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:max-w-xs" />
      </Card>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message="Failed to load team log" />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No check-ins" hint="Nobody has checked in on this date." />
      ) : (
        <div className="space-y-2.5">
          {data.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar user={r.user} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{r.user.name}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{r.user.email}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <TeamPunch label="In" time={fmtTime(r.checkInAt)} loc={r.checkInLocation} />
                <TeamPunch label="Out" time={r.checkOutAt ? fmtTime(r.checkOutAt) : '—'} loc={r.checkOutLocation} />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total </span>
                  <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{fmtHours(r.checkInAt, r.checkOutAt)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamPunch({ label, time, loc }: { label: string; time: string; loc: { lat: number; lng: number } | null }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{time}</div>
      {loc ? <MapLink lat={loc.lat} lng={loc.lng} /> : null}
    </div>
  );
}
