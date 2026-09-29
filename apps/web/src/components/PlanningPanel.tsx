import { useMemo, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import { formatDateTime, formatWorkingDuration } from '../lib/format';
import { useMyReservedTime, useReservedTimeMutations, useUnallocatedWork, useWeeklyCapacity } from '../hooks/usePlanning';
import { Avatar } from './Avatar';
import { Badge, Button, Card, Spinner } from './ui';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Monday (UTC date arithmetic, shown as calendar dates) of the week containing `d`. */
function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/**
 * Weekly planning: each member's available capacity after meetings/reserved
 * time and approved leave, what is allocated against it, and the remaining
 * effort nobody has been planned against yet.
 */
export function PlanningPanel({ workspaceId, onOpenTask }: { workspaceId: string; onOpenTask: (taskId: string) => void }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const periodStart = ymd(weekStart);
  const periodEnd = ymd(new Date(weekStart.getTime() + 6 * 86400000));
  const capacity = useWeeklyCapacity(workspaceId, periodStart, periodEnd);
  const unallocated = useUnallocatedWork(workspaceId);
  const mine = useMyReservedTime(`${periodStart}T00:00:00.000Z`, new Date(weekStart.getTime() + 7 * 86400000).toISOString());
  const { add, remove } = useReservedTimeMutations();

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'MEETING' | 'TRAINING' | 'OTHER'>('MEETING');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const totalUnallocated = useMemo(() => (unallocated.data ?? []).reduce((s, x) => s + x.unallocatedMinutes, 0), [unallocated.data]);
  const shift = (days: number) => setWeekStart((w) => new Date(w.getTime() + days * 86400000));
  const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-[#252525] dark:text-white';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add.mutate(
      { kind, title: title.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() },
      { onSuccess: () => { setTitle(''); setStartsAt(''); setEndsAt(''); } },
    );
  };

  return (
    <Card className="mt-6 space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Weekly planning</h2>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Button variant="ghost" className="px-3 py-1" onClick={() => shift(-7)}>Prev</Button>
          <span className="min-w-40 text-center text-slate-600 dark:text-slate-300">{periodStart} → {periodEnd}</span>
          <Button variant="ghost" className="px-3 py-1" onClick={() => shift(7)}>Next</Button>
        </div>
      </div>

      {capacity.isLoading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Person</th>
                <th className="py-2 pr-3">Scheduled</th>
                <th className="py-2 pr-3">Meetings / reserved</th>
                <th className="py-2 pr-3">Leave</th>
                <th className="py-2 pr-3">Available</th>
                <th className="py-2 pr-3">Allocated</th>
                <th className="py-2">Load</th>
              </tr>
            </thead>
            <tbody>
              {capacity.data?.map((r) => (
                <tr key={r.user.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3"><span className="flex items-center gap-2"><Avatar user={r.user} size="sm" />{r.user.name}</span></td>
                  <td className="py-2 pr-3">{formatWorkingDuration(r.scheduledMinutes)}</td>
                  <td className="py-2 pr-3">{r.reservedMinutes ? formatWorkingDuration(r.reservedMinutes) : '–'}</td>
                  <td className="py-2 pr-3">{r.leaveMinutes ? formatWorkingDuration(r.leaveMinutes) : '–'}</td>
                  <td className="py-2 pr-3">{r.availabilityLabel ?? formatWorkingDuration(r.availableMinutes)}</td>
                  <td className="py-2 pr-3">{formatWorkingDuration(r.allocatedMinutes)}</td>
                  <td className="py-2">
                    {r.overloadMinutes > 0 ? <Badge tone="amber">Over by {formatWorkingDuration(r.overloadMinutes)}</Badge>
                      : r.utilisationPercent === null ? <span className="text-slate-400">–</span>
                      : <Badge tone="green">{Math.round(r.utilisationPercent)}%</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          Unallocated work{unallocated.data?.length ? ` · ${formatWorkingDuration(totalUnallocated)} unplanned across ${unallocated.data.length} task(s)` : ''}
        </h3>
        {unallocated.isLoading ? <Spinner /> : !unallocated.data?.length ? (
          <p className="text-sm text-slate-500">Every open task is planned and assigned.</p>
        ) : (
          <ul className="space-y-1.5">
            {unallocated.data.map((x) => (
              <li key={x.taskId}>
                <button type="button" onClick={() => onOpenTask(x.taskId)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                  <span className="min-w-0 truncate"><span className="font-semibold text-indigo-600 dark:text-indigo-400">{x.ref}</span> {x.title}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {x.assigneeCount === 0 ? <Badge tone="amber">No assignee</Badge> : null}
                    {x.unallocatedMinutes > 0 ? <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{formatWorkingDuration(x.unallocatedMinutes)} unplanned</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">My reserved time this week</h3>
        <ul className="mb-3 space-y-1">
          {mine.data?.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span><Badge>{r.kind}</Badge> {r.title} · {formatDateTime(r.startsAt)} → {formatDateTime(r.endsAt)}</span>
              <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => remove.mutate(r.id)}>Remove</button>
            </li>
          ))}
          {mine.data && mine.data.length === 0 ? <li className="text-sm text-slate-500">Nothing reserved.</li> : null}
        </ul>
        <form onSubmit={submit} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_1fr_1fr_auto]">
          <input aria-label="Reservation title" className={field} placeholder="Title (e.g. Sprint planning)" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <select aria-label="Reservation kind" className={field} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="MEETING">Meeting</option>
            <option value="TRAINING">Training</option>
            <option value="OTHER">Other</option>
          </select>
          <input aria-label="Reservation start" type="datetime-local" className={field} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          <input aria-label="Reservation end" type="datetime-local" className={field} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
          <Button type="submit" disabled={add.isPending}>Reserve</Button>
        </form>
        {add.error ? <p className="mt-2 text-sm text-red-600">{add.error instanceof ApiRequestError ? add.error.message : 'Could not reserve time'}</p> : null}
      </div>
    </Card>
  );
}
