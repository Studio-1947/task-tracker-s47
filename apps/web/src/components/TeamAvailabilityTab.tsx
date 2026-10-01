import { useMemo, useState } from 'react';
import type { AttendanceDayState } from '@task-tracker/shared';
import { useTeamAvailability } from '../hooks/useAttendance';
import { Avatar } from './Avatar';
import { Button, Card, ErrorState, Spinner } from './ui';

const STYLE: Record<AttendanceDayState, { short: string; cls: string }> = {
  WORKED: { short: 'In', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  PAID_LEAVE: { short: 'Leave', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
  UNPAID_LEAVE: { short: 'Unpaid', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  ABSENCE: { short: 'Absent', cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  HOLIDAY: { short: 'Holiday', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  WEEKLY_OFF: { short: 'Off', cls: 'bg-slate-50 text-slate-400 dark:bg-slate-900/40 dark:text-slate-500' },
  PENDING_CORRECTION: { short: 'Fix?', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  UPCOMING: { short: '', cls: 'text-slate-400' },
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Weekly team availability: who is in, on leave or off, per day, with approved leave and holidays accounted for. */
export function TeamAvailabilityTab() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const from = ymd(monday);
  const to = ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  const { data, isLoading, error } = useTeamAvailability(from, to);
  const shift = (weeks: number) => setMonday((m) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + weeks * 7));
  const today = ymd(new Date());

  const perDay = useMemo(() => {
    const t = new Map<string, number>();
    for (const p of data?.people ?? []) for (const d of p.days) if (d.state === 'PAID_LEAVE' || d.state === 'UNPAID_LEAVE') t.set(d.date, (t.get(d.date) ?? 0) + 1);
    return t;
  }, [data]);

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Team availability · {from} to {to}</h2>
        <div className="flex gap-1.5">
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => shift(-1)}>Previous week</Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setMonday(mondayOf(new Date()))}>This week</Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => shift(1)}>Next week</Button>
        </div>
      </div>
      {isLoading ? <Spinner /> : error ? <ErrorState message="Could not load team availability." /> : null}
      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th scope="col" className="sticky left-0 bg-white py-2 pr-3 dark:bg-[#181818]">Person</th>
                {data.dates.map((d) => (
                  <th key={d} scope="col" className={`px-1 py-2 text-center ${d === today ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                    {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.user.id} className="border-t border-slate-100 dark:border-slate-800/60">
                  <th scope="row" className="sticky left-0 bg-white py-1.5 pr-3 text-left font-semibold text-slate-700 dark:bg-[#181818] dark:text-slate-200">
                    <span className="flex items-center gap-2"><Avatar user={p.user} size="sm" />{p.user.name}</span>
                  </th>
                  {p.days.map((d) => (
                    <td key={d.date} className="px-1 py-1.5 text-center">
                      <span title={d.detail ?? STYLE[d.state].short} className={`block rounded-md px-1 py-1 font-semibold ${STYLE[d.state].cls}`}>
                        {d.halfDay ? '½ ' : ''}{STYLE[d.state].short || (d.date === today ? 'Today' : '·')}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <th scope="row" className="sticky left-0 bg-white py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-[#181818]">On leave</th>
                {data.dates.map((d) => <td key={d} className="px-1 py-2 text-center font-bold text-slate-600 dark:text-slate-300">{perDay.get(d) ?? 0}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-slate-400">In = checked in. Weekends and holidays follow the organisation calendar. Absence is only a past scheduled day with no check-in and no approved leave.</p>
    </Card>
  );
}
