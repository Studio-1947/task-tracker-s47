import { useMemo, useState } from 'react';
import type {
  AttendanceDayState, AttendancePunchInput, LeaveBalance, LeaveRequestItem, CarryForwardPolicyType, ApprovalRequiredType, EntitlementUnitType, ApplicableGenderType } from '@task-tracker/shared';
import { useAuth } from '../stores/auth';
import { ApiRequestError } from '../lib/api';
import { useUsers } from '../hooks/useUsers';
import { Avatar } from '../components/Avatar';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { PolicyTab } from '../components/PolicyTab';
import { PayrollTab } from '../components/PayrollTab';
import { TeamAvailabilityTab } from '../components/TeamAvailabilityTab';
import { OrganisationCalendarCard } from '../components/CalendarAdmin';
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
  useMyDayStates,
  useCanViewTeamAvailability,
  useMyBalances,
  useMyLeaves,
  useReviewLeave,
  useSetUserBalances,
  useTeamLog,
  useMyAttendanceTiming,
  useAttendanceTimingOverview,
  useUpdateLeaveType,
  useUserBalances,
  useMyCorrections,
  useListCorrections,
  useRequestCorrection,
  useReviewCorrection,
  useImportLeavePolicyPdf,
  type AttendanceCorrectionItem,
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
  REJECTED: 'slate',
  CANCELLED: 'slate',
};

type Tab = 'me' | 'approvals' | 'corrections' | 'types' | 'allotments' | 'team' | 'policy' | 'payroll' | 'calendar' | 'availability' | 'timing';

export function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('me');
  const { data: availabilityAccess } = useCanViewTeamAvailability();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'me', label: 'My Attendance' },
    ...(isAdmin
      ? ([
          { key: 'approvals', label: 'Leave Approvals' },
          { key: 'corrections', label: 'Attendance Corrections' },
          { key: 'types', label: 'Leave Types' },
          { key: 'allotments', label: 'Allotments' },
          { key: 'team', label: 'Team Log' },
          { key: 'policy', label: 'Policy' },
          { key: 'payroll', label: 'Payroll Inputs' },
          { key: 'calendar', label: 'Organisation Calendar' },
        ] as { key: Tab; label: string }[])
      : []),
    ...(availabilityAccess?.allowed ? ([{ key: 'availability', label: 'Team Availability' }, { key: 'timing', label: 'Late & Overtime' }] as { key: Tab; label: string }[]) : []),
    ...(!isAdmin && availabilityAccess?.allowed ? ([{ key: 'corrections', label: 'Attendance Corrections' }] as { key: Tab; label: string }[]) : []),
  ];

  
  const startTour = () => {
    let steps: any[] = [];
    if (tab === 'me') {
      steps = [
        { element: '#tour-checkin', popover: { title: 'Check In/Out', description: 'Use this button to record your daily attendance. The system captures your timestamp and approximate location automatically.' } },
        { element: '#tour-calendar', popover: { title: 'Attendance Calendar', description: 'See your complete monthly history at a glance. Weekends and approved holidays are automatically highlighted.' } },
        { element: '#tour-timing', popover: { title: 'Timing History', description: 'A breakdown of your exact punches for the last 7 days.' } }
      ];
    } else if (tab === 'types') {
      steps = [
        { element: '#tour-accrual', popover: { title: 'Monthly Accrual', description: 'Instead of an annual lump-sum, enter how many days employees earn each month. Set to 0 if you use a fixed annual default.', side: 'bottom', align: 'start' } },
        { element: '#tour-carry', popover: { title: 'Carry Forward Max', description: 'At the end of the year, this is the maximum number of unused days that can roll over into the new year. Enter 0 for no rollover.', side: 'bottom', align: 'start' } },
        { element: '#tour-expire', popover: { title: 'Expiry Months', description: 'If days roll over, how many months do they have to use them before they lapse? (e.g., 3 means they expire March 31st). Leave blank for never.', side: 'bottom', align: 'start' } },
        { element: '#tour-policy', popover: { title: 'Carry Policy', description: 'Choose whether balances lapse after reaching the max cap, carry over completely without a cap, or just reset to 0 every Jan 1st.', side: 'bottom', align: 'start' } }
      ];
    } else if (tab === 'approvals') {
      steps = [
        { element: '#tour-filter', popover: { title: 'Status Filter', description: 'Toggle between Pending, Approved, and Declined leave requests.', side: 'bottom' } },
        { element: '#tour-reqs', popover: { title: 'Leave Requests', description: 'Review requests from your team. If a request causes a staffing clash, the system will warn you in orange.', side: 'top' } }
      ];
    } else if (tab === 'allotments') {
      steps = [
        { element: '#tour-user-select', popover: { title: 'Select Member', description: 'Pick an employee to view or modify their leave balances.', side: 'bottom' } },
        { element: '#tour-balances', popover: { title: 'Allotments', description: 'Override the default number of days granted for this specific user. This overrides the company-wide default balance.', side: 'top' } }
      ];
    } else if (tab === 'team') {
      steps = [
        { element: '#tour-log-date', popover: { title: 'Select Date', description: 'Pick any date to view the attendance log for the entire team.', side: 'bottom' } },
        { element: '#tour-log-punches', popover: { title: 'Team Punches', description: 'See exactly when team members checked in and out, and their total hours for the day.', side: 'top' } }
      ];
    } else if (tab === 'corrections') {
      steps = [
        { element: '#tour-corr-filter', popover: { title: 'Filter Corrections', description: 'Filter corrections by status to manage your backlog.', side: 'bottom' } },
        { element: '#tour-corr-list', popover: { title: 'Approve or Reject', description: 'Review why someone is requesting a time correction. Approving will permanently overwrite their punch record for that day.', side: 'top' } }
      ];
    } else if (tab === 'calendar') {
      steps = [
        { element: '#tour-cal-settings', popover: { title: 'Organisation Settings', description: 'Configure global timezone, working hours, and unpaid break limits here.', side: 'bottom' } },
        { element: '#tour-cal-holidays', popover: { title: 'Holidays', description: 'Add individual holidays or bulk upload a PDF to mark non-working days for the whole company.', side: 'top' } }
      ];
    } else if (tab === 'policy') {
      steps = [
        { element: '#tour-policy-doc', popover: { title: 'Policy Document', description: 'Upload and enforce attendance guidelines. Team members will be able to download and review this document.', side: 'bottom' } }
      ];
    } else if (tab === 'payroll') {
      steps = [
        { element: '#tour-payroll-export', popover: { title: 'Payroll Export', description: 'Generate a consolidated CSV file containing all approved leaves and total working hours, ready for your payroll provider.', side: 'bottom' } }
      ];
    } else if (tab === 'availability') {
      steps = [
        { element: '#tour-avail-calendar', popover: { title: 'Team Calendar', description: 'A consolidated view of approved leaves across the entire team to help you plan staffing.', side: 'bottom' } }
      ];
    } else if (tab === 'timing') {
      steps = [
        { element: '#tour-timing-late', popover: { title: 'Late & Overtime', description: 'Review who consistently arrives late or stays past their shift. Helps identify burnout or attendance issues.', side: 'bottom' } }
      ];
    }

    if (steps.length > 0) {
      driver({ showProgress: true, steps }).drive();
    } else {
      alert("A tour is not available for this tab yet.");
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Attendance</h1>
        <button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-2 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button>
      </div>

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
        {tab === 'corrections' ? <CorrectionsReviewTab /> : null}
        {tab === 'types' ? <LeaveTypesTab /> : null}
        {tab === 'allotments' ? <AllotmentsTab /> : null}
        {tab === 'availability' ? <TeamAvailabilityTab /> : null}
        {tab === 'timing' ? <TimingOverviewTab /> : null}
        {tab === 'team' ? <TeamLogTab /> : null}
        {tab === 'policy' ? <PolicyTab /> : null}
        {tab === 'payroll' ? <PayrollTab /> : null}
        {tab === 'calendar' ? <OrganisationCalendarCard /> : null}
      </div>
    </div>
  );
}

/* ── My Attendance ── */
function MyAttendanceTab() {
  const [showRequest, setShowRequest] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  return (
    <div className="space-y-6">
      <CheckInCard onOpenCorrection={() => setShowCorrection(true)} />
      <div id="tour-timing"><MyTimingHistory /></div>
      <BalancesRow />
      <MonthCalendar onCorrect={() => setShowCorrection(true)} />
      <MyCorrectionsSection onOpenCorrection={() => setShowCorrection(true)} />
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">My leave history &amp; deductions</h2>
          <Button className="py-2 px-4 text-xs" onClick={() => setShowRequest(true)}>
            Request leave
          </Button>
        </div>
        <MyLeavesList />
      </section>
      {showRequest ? <RequestLeaveModal onClose={() => setShowRequest(false)} /> : null}
      {showCorrection ? <RequestCorrectionModal onClose={() => setShowCorrection(false)} /> : null}
    </div>
  );
}

function CheckInCard({ onOpenCorrection }: { onOpenCorrection?: () => void }) {
  const { data, isLoading } = useAttendanceToday();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const [askTimer, setAskTimer] = useState(false);

  const punch = async (kind: 'in' | 'out', timerAction?: 'STOP' | 'KEEP') => {
    setError(null);
    setAskTimer(false);
    setLocating(true);
    const geo = await getGeo();
    setLocating(false);
    const m = kind === 'in' ? checkIn : checkOut;
    m.mutate(timerAction ? { ...geo, timerAction } : geo, {
      onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Something went wrong'),
    });
  };
  const timer = data?.runningTimer ?? null;

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
              <Button variant="danger" disabled={busy} onClick={() => (timer ? setAskTimer(true) : void punch('out'))} className="px-6 py-3 font-semibold">
                {busy ? 'Locating…' : 'Check out'}
              </Button>
            ) : (
              <Badge tone="green">Done for today ✓</Badge>
            )}
            {onOpenCorrection ? (
              <Button variant="ghost" onClick={onOpenCorrection} className="py-2.5 px-3.5 text-xs font-semibold">
                Fix punch / Request correction
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {askTimer && timer ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10" role="alertdialog" aria-label="Timer still running">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            A timer is still running on “{timer.taskTitle}”{timer.isPaused ? ' (paused)' : ''}.
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Checking out never turns your attendance hours into task time. Choose what happens to the timer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy} onClick={() => void punch('out', 'STOP')} className="px-4 py-2 text-xs font-semibold">
              Stop timer &amp; check out
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void punch('out', 'KEEP')} className="px-4 py-2 text-xs font-semibold">
              Keep timer running &amp; check out
            </Button>
            <Button variant="ghost" onClick={() => setAskTimer(false)} className="px-4 py-2 text-xs font-semibold">
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {rec?.automaticHalfDayLeave ? (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-200">
          Half-day Earned Leave recorded automatically because today’s check-in was after 2:00 PM.
        </div>
      ) : null}
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

const minutesLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${pad2(minutes % 60)}m`;

/** Personal-only history: employees can always see exactly which days were late or overtime. */
function MyTimingHistory() {
  const [cursor, setCursor] = useState(() => new Date());
  const month = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;
  const { data, isLoading } = useMyAttendanceTiming(month);
  const late = (data ?? []).filter((row) => row.lateMinutes > 0);
  const overtime = (data ?? []).filter((row) => row.overtimeMinutes > 0);
  const move = (delta: number) => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">My late &amp; overtime</h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Late after your start time plus the organisation grace period. Overtime starts after end time plus that grace period.</p>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn label="Previous month" onClick={() => move(-1)} d="M15 18l-6-6 6-6" />
          <span className="min-w-22 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">{cursor.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
          <IconBtn label="Next month" onClick={() => move(1)} d="M9 18l6-6-6-6" />
        </div>
      </div>
      {isLoading ? <Spinner /> : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TimingMetric label="Late days" value={late.length} tone="amber" />
            <TimingMetric label="Late time" value={minutesLabel(late.reduce((n, r) => n + r.lateMinutes, 0))} tone="amber" />
            <TimingMetric label="Overtime days" value={overtime.length} tone="indigo" />
            <TimingMetric label="Overtime" value={minutesLabel(overtime.reduce((n, r) => n + r.overtimeMinutes, 0))} tone="indigo" />
          </div>
          {(data ?? []).length === 0 ? <p className="py-2 text-sm text-slate-400">No attendance records this month.</p> : (
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left uppercase tracking-wider text-slate-400"><tr><th className="py-2">Date</th><th>Check in</th><th>Check out</th><th>Late</th><th>Overtime</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {data!.map((row) => <tr key={row.id} className="text-slate-600 dark:text-slate-300"><td className="py-2 font-medium">{fmtDate(row.workDate)}{row.automaticHalfDayLeave ? <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">½ EL</span> : null}</td><td>{fmtTime(row.checkInAt)}</td><td>{row.checkOutAt ? fmtTime(row.checkOutAt) : 'Working'}</td><td className={row.lateMinutes ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>{row.lateMinutes ? minutesLabel(row.lateMinutes) : '—'}</td><td className={row.overtimeMinutes ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''}>{row.overtimeMinutes ? minutesLabel(row.overtimeMinutes) : '—'}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function TimingMetric({ label, value, tone }: { label: string; value: string | number; tone: 'amber' | 'indigo' }) {
  const cls = tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400';
  return <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-lg font-bold tabular-nums ${cls}`}>{value}</p></div>;
}

/** Admins see the whole organisation; workspace managers receive only their managed-team records from the API. */
function TimingOverviewTab() {
  const [cursor, setCursor] = useState(() => new Date());
  const month = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;
  const { data, isLoading, error } = useAttendanceTimingOverview(month, true);
  const move = (delta: number) => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState message="Could not load late and overtime records." />;
  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Late &amp; overtime overview</h2><p className="mt-0.5 text-xs text-slate-400">Your permitted team scope only.</p></div>
          <div className="flex items-center gap-1"><IconBtn label="Previous month" onClick={() => move(-1)} d="M15 18l-6-6 6-6" /><span className="min-w-24 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><IconBtn label="Next month" onClick={() => move(1)} d="M9 18l6-6-6-6" /></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><TimingMetric label="Late days" value={data.lateDays} tone="amber" /><TimingMetric label="Late time" value={minutesLabel(data.lateMinutes)} tone="amber" /><TimingMetric label="Overtime days" value={data.overtimeDays} tone="indigo" /><TimingMetric label="Overtime" value={minutesLabel(data.overtimeMinutes)} tone="indigo" /></div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-900/40"><tr><th className="px-4 py-3">Person</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Check in</th><th className="px-3 py-3">Check out</th><th className="px-3 py-3">Late</th><th className="px-4 py-3">Overtime</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">{data.records.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200"><span className="flex items-center gap-2"><Avatar user={row.user} size="sm" />{row.user.name}</span></td><td className="px-3 py-3 text-slate-500">{fmtDate(row.workDate)}{row.automaticHalfDayLeave ? <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">½ EL</span> : null}</td><td className="px-3 py-3">{fmtTime(row.checkInAt)}</td><td className="px-3 py-3">{row.checkOutAt ? fmtTime(row.checkOutAt) : <span className="text-amber-600">Working</span>}</td><td className="px-3 py-3 font-semibold text-amber-600 dark:text-amber-400">{row.lateMinutes ? minutesLabel(row.lateMinutes) : '—'}</td><td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{row.overtimeMinutes ? minutesLabel(row.overtimeMinutes) : '—'}</td></tr>)}{data.records.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No attendance records this month.</td></tr> : null}</tbody></table></div>
      </Card>
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
        <span className="min-w-0 break-words text-xs font-bold uppercase leading-tight tracking-wider text-slate-500 dark:text-slate-400">{b.typeName}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{b.remaining}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-400 dark:text-slate-500">
        of {b.allotted + b.carriedForward - b.expired} left · {b.used} used
      </div>
      {b.carriedForward > 0 ? (
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Includes {b.carriedForward} carried forward{b.carryForwardExpiresOn ? ` (use by ${fmtDate(b.carryForwardExpiresOn)})` : ''}
        </div>
      ) : null}
      {b.expired > 0 ? <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{b.expired} carried-forward day(s) expired</div> : null}
      {b.nextAccrualOn ? <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Next accrual {fmtDate(b.nextAccrualOn)}</div> : null}
    </Card>
  );
}

const DAY_STATE_STYLE: Record<AttendanceDayState, { label: string; cell: string; text: string }> = {
  WORKED: { label: 'Worked', cell: 'bg-emerald-50/60 dark:bg-emerald-950/15', text: 'text-emerald-600 dark:text-emerald-400' },
  PAID_LEAVE: { label: 'Paid leave', cell: 'bg-indigo-50/60 dark:bg-indigo-950/20', text: 'text-indigo-600 dark:text-indigo-400' },
  UNPAID_LEAVE: { label: 'Unpaid leave', cell: 'bg-slate-100/70 dark:bg-slate-800/40', text: 'text-slate-600 dark:text-slate-300' },
  ABSENCE: { label: 'Absent', cell: 'bg-red-50/70 dark:bg-red-950/20', text: 'text-red-600 dark:text-red-400' },
  HOLIDAY: { label: 'Holiday', cell: 'bg-sky-50/70 dark:bg-sky-950/20', text: 'text-sky-600 dark:text-sky-400' },
  WEEKLY_OFF: { label: 'Weekly off', cell: 'bg-slate-50 dark:bg-slate-900/40', text: 'text-slate-400 dark:text-slate-500' },
  PENDING_CORRECTION: { label: 'Pending correction', cell: 'bg-amber-50/80 dark:bg-amber-950/20', text: 'text-amber-600 dark:text-amber-400' },
  UPCOMING: { label: '', cell: '', text: 'text-slate-400' },
};

function MonthCalendar({ onCorrect }: { onCorrect?: () => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const month = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;
  const { data: records } = useMyAttendance(month);
  const { data: leaves } = useMyLeaves();
  const { data: dayStates } = useMyDayStates(month);
  const stateByDay = useMemo(() => new Map((dayStates ?? []).map((d) => [d.date, d])), [dayStates]);
  const tally = useMemo(() => {
    const t: Partial<Record<AttendanceDayState, number>> = {};
    for (const d of dayStates ?? []) t[d.state] = (t[d.state] ?? 0) + 1;
    return t;
  }, [dayStates]);
  const missing = (dayStates ?? []).filter((d) => d.missingCheckout);

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
          const st = stateByDay.get(dateStr);
          return (
            <div
              key={dateStr}
              className={`min-h-14 rounded-lg border p-1.5 text-left ${
                isToday
                  ? 'border-indigo-400 dark:border-indigo-500/60'
                  : 'border-slate-100 dark:border-slate-800/60'
              } ${st ? DAY_STATE_STYLE[st.state].cell : leave ? '' : rec ? 'bg-emerald-50/50 dark:bg-emerald-950/15' : ''}`}
              style={!st && leave?.color ? { backgroundColor: `${leave.color}18` } : undefined}
              title={leave ? `${leave.typeName} leave` : rec ? `In ${fmtTime(rec.checkInAt)}${rec.checkOutAt ? ` · Out ${fmtTime(rec.checkOutAt)}` : ''}` : undefined}
            >
              <div className={`text-xs font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{day}</div>
              {st && st.state !== 'UPCOMING' && !(st.state === 'WORKED' && rec) && st.state !== 'PAID_LEAVE' && st.state !== 'UNPAID_LEAVE' ? (
                <div className={`mt-0.5 text-[9px] font-semibold leading-tight ${DAY_STATE_STYLE[st.state].text}`}>
                  {st.state === 'HOLIDAY' && st.detail ? st.detail : DAY_STATE_STYLE[st.state].label}
                </div>
              ) : leave ? (
                <div className="mt-0.5 truncate text-[9px] font-semibold" style={{ color: leave.color ?? '#6366f1' }}>
                  {leave.halfDay ? '½ ' : ''}{leave.typeName}{st?.state === 'UNPAID_LEAVE' ? ' (unpaid)' : ''}
                </div>
              ) : rec ? (
                <div className="mt-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {fmtTime(rec.checkInAt)}
                  {st?.missingCheckout ? <span className="block text-amber-600 dark:text-amber-400">No check-out</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        <Legend swatch="bg-emerald-400" label="Worked" />
        <Legend swatch="bg-indigo-400" label="Paid leave" />
        <Legend swatch="bg-slate-400" label="Unpaid leave" />
        <Legend swatch="bg-red-400" label="Absent" />
        <Legend swatch="bg-sky-400" label="Holiday" />
        <Legend swatch="bg-slate-200 dark:bg-slate-700" label="Weekly off" />
        <Legend swatch="bg-amber-400" label="Pending correction" />
      </div>
      {dayStates ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400" data-testid="month-summary">
          This month: {tally.WORKED ?? 0} worked, {(tally.PAID_LEAVE ?? 0) + (tally.UNPAID_LEAVE ?? 0)} on leave, {tally.ABSENCE ?? 0} absent,
          {' '}{tally.HOLIDAY ?? 0} holiday, {tally.WEEKLY_OFF ?? 0} weekly off, {tally.PENDING_CORRECTION ?? 0} pending correction.
          Weekends and holidays are never counted as absence.
        </p>
      ) : null}
      {missing.length ? (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          <span>Missing check-out on {missing.map((d) => d.date).join(', ')}.</span>
          {onCorrect ? <button type="button" className="font-semibold underline" onClick={onCorrect}>Request a correction</button> : null}
        </div>
      ) : null}
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
              {l.reason?.startsWith('Automatically recorded: check-in after 2:00 PM.') ? <Badge tone="amber">Automatic deduction</Badge> : null}
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
  const [overriding, setOverriding] = useState<LeaveRequestItem | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const approve = (l: LeaveRequestItem, extra?: { overrideStaffingClash: true; note: string }) => {
    setReviewError(null);
    review.mutate(
      { id: l.id, review: { status: 'APPROVED', ...extra } },
      {
        onSuccess: () => setOverriding(null),
        onError: (err) => {
          // A staffing clash can be approved anyway, but only with an explained override.
          if (err instanceof ApiRequestError && err.status === 409) setOverriding(l);
          else setReviewError(err instanceof ApiRequestError ? err.message : 'Could not approve');
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {reviewError ? <p className="text-sm text-red-600 dark:text-red-400">{reviewError}</p> : null}
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
                  {l.staffingWarnings?.length ? (
                    <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Staffing clash: {l.staffingWarnings[0]!.percentAway}% of {l.staffingWarnings[0]!.workspaceName} would be away on {fmtDate(l.staffingWarnings[0]!.date)}
                      {l.staffingWarnings.length > 1 ? ` (+${l.staffingWarnings.length - 1} more)` : ''}
                    </div>
                  ) : null}
                </div>
              </div>
              {l.status === 'PENDING' ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    className="py-1.5 px-3 text-xs"
                    disabled={review.isPending}
                    onClick={() => approve(l)}
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
      {overriding ? (
        <OverrideStaffingModal
          request={overriding}
          pending={review.isPending}
          onCancel={() => setOverriding(null)}
          onConfirm={(note) => approve(overriding, { overrideStaffingClash: true, note })}
        />
      ) : null}
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

function OverrideStaffingModal({
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
  const w = request.staffingWarnings?.[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={onCancel} />
      <Card className="relative z-10 w-full max-w-md p-6 animate-fade-in">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Approve despite staffing clash?</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Approving <span className="font-semibold text-slate-700 dark:text-slate-200">{request.user.name}</span>’s leave would leave too few people
          {w ? ` in ${w.workspaceName} on ${fmtDate(w.date)} (${w.percentAway}% away)` : ''}. Explain why this is acceptable; it is kept on the request.
        </p>
        <label className="mt-4 mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Reason (required)</label>
        <textarea
          autoFocus
          rows={3}
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
          placeholder="e.g. Cover arranged with a contractor"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button onClick={() => onConfirm(note.trim())} disabled={pending || !note.trim()}>
            {pending ? 'Approving…' : 'Approve anyway'}
          </Button>
        </div>
      </Card>
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
  const importPdf = useImportLeavePolicyPdf();

  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [defaultBalance, setDefaultBalance] = useState(12);
  const [accrualPerMonth, setAccrualPerMonth] = useState(0);
  const [carryForwardMax, setCarryForwardMax] = useState(0);
  const [expiryMonths, setExpiryMonths] = useState('');
  const [carryForwardPolicy, setCarryForwardPolicy] = useState<CarryForwardPolicyType>('LAPSE_AFTER_YEAR' as CarryForwardPolicyType);
  const [approvalRequired, setApprovalRequired] = useState<ApprovalRequiredType>('MANAGER_APPROVAL' as ApprovalRequiredType);
  const [entitlementUnit, setEntitlementUnit] = useState<EntitlementUnitType>('DAYS' as EntitlementUnitType);
  const [wfhEntitlementDays, setWfhEntitlementDays] = useState<number | ''>('');
  const [applicableGender, setApplicableGender] = useState<ApplicableGenderType>('ALL' as ApplicableGenderType);
  const [policyNotes, setPolicyNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name, color, defaultBalance, accrualPerMonth, carryForwardMax, carryForwardExpiryMonths: expiryMonths ? Number(expiryMonths) : null, carryForwardPolicy, approvalRequired, entitlementUnit, wfhEntitlementDays: wfhEntitlementDays === '' ? 0 : Number(wfhEntitlementDays), applicableGender, policyNotes: policyNotes || undefined });
      setName('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create type');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = (await importPdf.mutateAsync(file)).filter((p) => p.name);
      if (parsed.length === 0) {
        setError('No leave types could be read from that PDF. Add them manually instead.');
        return;
      }
      // The text is read heuristically, so show what was found before creating anything.
      if (!window.confirm(`Create ${parsed.length} leave type(s) from this PDF?\n\n${parsed.map((p) => `- ${p.name}`).join('\n')}\n\nCheck each one afterwards: the policy text is read automatically and may be wrong.`)) return;
      setError(null);
      for (const p of parsed) {
        if (!p.name) continue;
        await create.mutateAsync({
          name: p.name,
          color: p.color ?? '#6366f1',
          defaultBalance: p.defaultBalance ?? 0,
          accrualPerMonth: p.accrualPerMonth ?? 0,
          carryForwardMax: p.carryForwardMax ?? 0,
          carryForwardExpiryMonths: p.carryForwardExpiryMonths ?? null,
          carryForwardPolicy: (p.carryForwardPolicy as CarryForwardPolicyType) ?? 'LAPSE_AFTER_YEAR',
          approvalRequired: (p.approvalRequired as ApprovalRequiredType) ?? 'MANAGER_APPROVAL',
          entitlementUnit: (p.entitlementUnit as EntitlementUnitType) ?? 'DAYS',
          wfhEntitlementDays: p.wfhEntitlementDays ?? 0,
          applicableGender: (p as { applicableGender?: ApplicableGenderType }).applicableGender ?? 'ALL',
          policyNotes: p.policyNotes ?? undefined,
        });
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to import PDF');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Leave Types</h2>
        <div>
          <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 inline-block">
            {importPdf.isPending ? 'Importing…' : 'Import from PDF'}
            <input type="file" className="hidden" accept="application/pdf" onChange={handleImport} disabled={importPdf.isPending} />
          </label>
        </div>
      </div>
      <Card className="p-5 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
        <form className="flex flex-col gap-4" onSubmit={add}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New leave type</label>
              <Input placeholder="e.g. Casual" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Color</label>
              <input aria-label="Color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#252525]" />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Default</label>
              <Input type="number" min={0} max={365} value={defaultBalance} onChange={(e) => setDefaultBalance(Number(e.target.value))} />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-accrual">Accrual <span className="cursor-help opacity-70" title="Days automatically credited on the 1st of each month (0 = fixed yearly days)">ⓘ</span></label>
              <Input type="number" min={0} max={31} step="0.25" value={accrualPerMonth} onChange={(e) => setAccrualPerMonth(Number(e.target.value))} />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-carry">Carry max <span className="cursor-help opacity-70" title="Maximum number of unused days that can roll over into the next year">ⓘ</span></label>
              <Input type="number" min={0} max={365} step="0.5" value={carryForwardMax} onChange={(e) => setCarryForwardMax(Number(e.target.value))} />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-expire">Expire(mo) <span className="cursor-help opacity-70" title="How many months into the new year before carried-over days expire (blank = never)">ⓘ</span></label>
              <Input type="number" min={1} max={24} placeholder="never" value={expiryMonths} onChange={(e) => setExpiryMonths(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-32">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-policy">Carry Policy <span className="cursor-help opacity-70" title="Lapse: Rolls over up to max. Carry All: Entire balance rolls over. No Carry: Resets to 0.">ⓘ</span></label>
              <select className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm bg-white dark:bg-[#252525] dark:text-white" value={carryForwardPolicy} onChange={(e) => setCarryForwardPolicy(e.target.value as CarryForwardPolicyType)}>
                <option value="LAPSE_AFTER_YEAR">Lapse</option>
                <option value="NO_CARRY_FORWARD">No Carry</option>
                <option value="CARRY_FORWARD">Carry All</option>
              </select>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Approval</label>
              <select className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm bg-white dark:bg-[#252525] dark:text-white" value={approvalRequired} onChange={(e) => setApprovalRequired(e.target.value as ApprovalRequiredType)}>
                <option value="MANAGER_APPROVAL">Manager</option>
                <option value="NO_APPROVAL">None</option>
                <option value="PRIOR_APPROVAL">Prior</option>
              </select>
            </div>
            <div className="w-28">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unit</label>
              <select className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm bg-white dark:bg-[#252525] dark:text-white" value={entitlementUnit} onChange={(e) => setEntitlementUnit(e.target.value as EntitlementUnitType)}>
                <option value="DAYS">Days</option>
                <option value="MONTHS">Months</option>
              </select>
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">WFH Days</label>
              <Input type="number" min={0} max={365} value={wfhEntitlementDays} onChange={(e) => setWfhEntitlementDays(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Applies to</label>
              <select aria-label="Applies to" className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm bg-white dark:bg-[#252525] dark:text-white" value={applicableGender} onChange={(e) => setApplicableGender(e.target.value as ApplicableGenderType)}>
                <option value="ALL">Everyone</option>
                <option value="FEMALE">Women only</option>
                <option value="MALE">Men only</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Policy Notes</label>
              <Input placeholder="Notes..." value={policyNotes} onChange={(e) => setPolicyNotes(e.target.value)} />
            </div>
            <Button type="submit" disabled={create.isPending || !name} className="py-2.5 px-6 ml-auto h-[42px]">Add</Button>
          </div>
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
            <Card key={t.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color ?? '#6366f1' }} />
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{t.name}</span>
                </div>
                <Button variant="danger" className="py-1.5 px-3 text-xs" disabled={del.isPending} onClick={() => del.mutate(t.id)}>
                  Remove
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1">
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
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400" title="Days credited each month (0 = fixed yearly days)">
                  Accrues
                  <input
                    type="number"
                    min={0}
                    max={31}
                    step="0.25"
                    defaultValue={t.accrualPerMonth}
                    className="w-16 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== t.accrualPerMonth) update.mutate({ id: t.id, patch: { accrualPerMonth: v } });
                    }}
                  />
                  /mo
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Policy
                  <select
                    className="w-28 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    defaultValue={t.carryForwardPolicy ?? 'LAPSE_AFTER_YEAR'}
                    onChange={(e) => update.mutate({ id: t.id, patch: { carryForwardPolicy: e.target.value as CarryForwardPolicyType } })}
                  >
                    <option value="LAPSE_AFTER_YEAR">Lapse</option>
                    <option value="NO_CARRY_FORWARD">No Carry</option>
                    <option value="CARRY_FORWARD">Carry All</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400" title="Most unused days carried into next year">
                  Carry max
                  <input
                    type="number"
                    min={0}
                    max={365}
                    step="0.5"
                    defaultValue={t.carryForwardMax}
                    className="w-16 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== t.carryForwardMax) update.mutate({ id: t.id, patch: { carryForwardMax: v } });
                    }}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400" title="Carried days lapse this many months into the year; blank = never">
                  Expires
                  <input
                    type="number"
                    min={1}
                    max={24}
                    placeholder="never"
                    defaultValue={t.carryForwardExpiryMonths ?? ''}
                    className="w-16 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      if (v !== t.carryForwardExpiryMonths) update.mutate({ id: t.id, patch: { carryForwardExpiryMonths: v } });
                    }}
                  />
                  mo
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Approval
                  <select
                    className="w-28 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    defaultValue={t.approvalRequired ?? 'MANAGER_APPROVAL'}
                    onChange={(e) => update.mutate({ id: t.id, patch: { approvalRequired: e.target.value as ApprovalRequiredType } })}
                  >
                    <option value="MANAGER_APPROVAL">Manager</option>
                    <option value="NO_APPROVAL">None</option>
                    <option value="PRIOR_APPROVAL">Prior</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Unit
                  <select
                    className="w-20 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    title="Label only: balances and requests are counted in days"
                    defaultValue={t.entitlementUnit ?? 'DAYS'}
                    onChange={(e) => update.mutate({ id: t.id, patch: { entitlementUnit: e.target.value as EntitlementUnitType } })}
                  >
                    <option value="DAYS">Days</option>
                    <option value="MONTHS">Months</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Gender
                  <select
                    className="w-24 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    defaultValue={t.applicableGender ?? 'ALL'}
                    onChange={(e) => update.mutate({ id: t.id, patch: { applicableGender: e.target.value as ApplicableGenderType } })}
                  >
                    <option value="ALL">All</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  WFH Days
                  <input
                    title="Reference figure only: work-from-home days are not tracked or deducted"
                    type="number"
                    min={0}
                    max={365}
                    placeholder="none"
                    defaultValue={t.wfhEntitlementDays ?? ''}
                    className="w-16 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      if ((v ?? 0) !== t.wfhEntitlementDays) update.mutate({ id: t.id, patch: { wfhEntitlementDays: v ?? 0 } });
                    }}
                  />
                </label>
              </div>
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Policy notes..."
                  defaultValue={t.policyNotes ?? ''}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm bg-white dark:bg-[#252525] dark:text-white"
                  onBlur={(e) => {
                    const v = e.target.value || null;
                    if (v !== (t.policyNotes ?? null)) update.mutate({ id: t.id, patch: { policyNotes: v } });
                  }}
                />
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

/* ── My Corrections List ── */
function MyCorrectionsSection({ onOpenCorrection }: { onOpenCorrection: () => void }) {
  const { data: corrections, isLoading } = useMyCorrections();

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          My attendance correction requests
        </h2>
        <Button variant="ghost" className="py-1.5 px-3 text-xs" onClick={onOpenCorrection}>
          + Request correction
        </Button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : !corrections || corrections.length === 0 ? (
        <Card className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
          No attendance corrections submitted.
        </Card>
      ) : (
        <div className="space-y-2.5">
          {corrections.map((c) => (
            <Card key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtDate(c.workDate)}</span>
                  <Badge tone={statusTone[c.status]}>{c.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Proposed punch: {fmtTime(c.proposedCheckInAt)} → {fmtTime(c.proposedCheckOutAt)}
                </div>
                <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">“{c.reason}”</p>
              </div>
              {c.reviewer ? (
                <div className="text-xs text-slate-400 dark:text-slate-500 text-right">
                  Reviewed by {c.reviewer.name}
                  {c.reviewNote ? <div className="italic">{c.reviewNote}</div> : null}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Request Correction Modal ── */
function RequestCorrectionModal({ onClose }: { onClose: () => void }) {
  const requestCorrection = useRequestCorrection();
  const [workDate, setWorkDate] = useState(() => ymd(new Date()));
  const [inTime, setInTime] = useState('09:30');
  const [outTime, setOutTime] = useState('18:30');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError('Please provide a reason for the correction');
    setError(null);

    const proposedCheckInAt = new Date(`${workDate}T${inTime}:00`).toISOString();
    const proposedCheckOutAt = new Date(`${workDate}T${outTime}:00`).toISOString();

    try {
      await requestCorrection.mutateAsync({
        workDate,
        proposedCheckInAt,
        proposedCheckOutAt,
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to request correction');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md p-6 animate-fade-in bg-white dark:bg-[#1f1f1f]">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Request attendance correction</h2>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Submit missing or corrected punch times for manager/admin approval.
        </p>

        <form className="mt-4 space-y-3.5" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Work Date</label>
            <Input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Corrected Check-In</label>
              <Input type="time" required value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Corrected Check-Out</label>
              <Input type="time" required value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reason</label>
            <textarea
              required
              rows={2}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
              placeholder="e.g. Forgot to check out / system downtime..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={requestCorrection.isPending}>
              {requestCorrection.isPending ? 'Submitting…' : 'Submit Correction'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ── Admin / Manager: Corrections Approval Tab ── */
function CorrectionsReviewTab() {
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const { data: corrections, isLoading, error } = useListCorrections(statusFilter || undefined);
  const review = useReviewCorrection();
  const [reviewNote, setReviewNote] = useState('');
  const [selectedItem, setSelectedItem] = useState<AttendanceCorrectionItem | null>(null);

  const handleReview = (id: string, status: 'APPROVED' | 'REJECTED') => {
    review.mutate(
      { id, input: { status, note: reviewNote || undefined } },
      {
        onSuccess: () => {
          setSelectedItem(null);
          setReviewNote('');
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status filter</label>
        <select
          aria-label="Filter status"
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs dark:text-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message="Failed to load attendance corrections" />
      ) : !corrections || corrections.length === 0 ? (
        <EmptyState title="No correction requests" hint="No attendance correction requests match this status filter." />
      ) : (
        <div className="space-y-3">
          {corrections.map((c) => (
            <Card key={c.id} className="p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar user={c.user} size="sm" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{c.user.name}</span>
                      <span className="text-xs text-slate-400">({c.user.email})</span>
                      <Badge tone={statusTone[c.status]}>{c.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Date: <span className="font-semibold">{fmtDate(c.workDate)}</span> · Proposed punch: {fmtTime(c.proposedCheckInAt)} → {fmtTime(c.proposedCheckOutAt)}
                    </div>
                  </div>
                </div>

                {c.status === 'PENDING' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      className="py-1.5 px-3 text-xs font-semibold"
                      disabled={review.isPending}
                      onClick={() => handleReview(c.id, 'APPROVED')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      className="py-1.5 px-3 text-xs font-semibold"
                      disabled={review.isPending}
                      onClick={() => setSelectedItem(c)}
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    Reviewed {c.reviewedAt ? fmtDate(c.reviewedAt.slice(0, 10)) : ''} {c.reviewer ? `by ${c.reviewer.name}` : ''}
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-[#222] p-2.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">Reason</span>
                “{c.reason}”
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={() => setSelectedItem(null)} />
          <Card className="relative z-10 w-full max-w-md p-6 animate-fade-in bg-white dark:bg-[#1f1f1f]">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Reject correction request</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Rejecting attendance correction for <span className="font-semibold">{selectedItem.user.name}</span> for date {fmtDate(selectedItem.workDate)}.
            </p>
            <textarea
              className="mt-3 w-full rounded-md border border-slate-300 dark:border-slate-700 p-2.5 text-xs bg-white dark:bg-[#252525] dark:text-white"
              rows={2}
              placeholder="Reason for rejection (optional)..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" className="py-1.5 px-3 text-xs" onClick={() => setSelectedItem(null)}>Cancel</Button>
              <Button variant="danger" className="py-1.5 px-3 text-xs" onClick={() => handleReview(selectedItem.id, 'REJECTED')}>Reject</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
