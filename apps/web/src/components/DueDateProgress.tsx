import { useCallback, useEffect, useState } from 'react';
import type { TaskListItem } from '@task-tracker/shared';
import { useUpdateTask } from '../hooks/useTasks';

/** Urgency threshold per priority for when amber warning triggers (feature B). */
const URGENCY_THRESHOLD: Record<string, number> = {
  LOW: 85,
  MEDIUM: 75,
  HIGH: 60,
  URGENT: 40,
};

/** Status-to-completion bonus for blended score (feature A). */
const STATUS_BONUS: Record<string, number> = {
  TODO: 0,
  IN_PROGRESS: 20,
  IN_REVIEW: 15,
  DONE: 100, // forces 100% green
};

/**
 * Computes urgency score for sorting (feature H).
 * urgencyScore = timePct × priorityMultiplier
 */
export function urgencyScore(t: TaskListItem): number {
  if (!t.dueDate) return 0;
  const multiplier: Record<string, number> = { LOW: 0.5, MEDIUM: 1.0, HIGH: 1.5, URGENT: 2.5 };
  const created = new Date(t.createdAt).getTime();
  const due = new Date(t.dueDate).getTime();
  const total = due - created;
  if (total <= 0) return 999;
  const pct = Math.min(100, Math.max(0, ((Date.now() - created) / total) * 100));
  return pct * (multiplier[t.priority] ?? 1);
}

/**
 * Smart due-date progress bar.
 * Features: A (status blend), B (priority threshold), C (pulse animation),
 * D (hover tooltip), E (live 60s tick), I (quick push buttons).
 */
export function DueDateProgress({
  t,
  workspaceId,
}: {
  t: TaskListItem;
  workspaceId: string;
}) {
  // E — live timer: re-render every 60s so label stays accurate
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const updateTask = useUpdateTask(workspaceId);
  const pushDeadline = useCallback(
    (days: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!t.dueDate) return;
      const next = new Date(t.dueDate);
      next.setDate(next.getDate() + days);
      updateTask.mutate({ id: t.id, patch: { dueDate: next.toISOString() } });
    },
    [t.id, t.dueDate, updateTask],
  );

  if (!t.dueDate) return null;

  const created = new Date(t.createdAt).getTime();
  const due = new Date(t.dueDate).getTime();

  // A — status-aware: DONE forces 100% green
  const statusBonus = STATUS_BONUS[t.status] ?? 0;
  const isDone = t.status === 'DONE';

  const total = due - created;
  const elapsed = now - created;
  const rawTimePct = total <= 0 ? 100 : Math.min(100, Math.max(0, (elapsed / total) * 100));

  // A — blended score (time 70%, status 30%)
  const pct = isDone ? 100 : Math.min(100, rawTimePct * 0.7 + statusBonus * 0.3);

  const isExpired = !isDone && now > due;
  // B — priority-aware threshold
  const threshold = URGENCY_THRESHOLD[t.priority] ?? 75;
  const isNearDue = !isExpired && !isDone && rawTimePct >= threshold;

  const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  const daysOverdue = Math.ceil((now - due) / (1000 * 60 * 60 * 24));

  const label = isDone
    ? 'Completed'
    : isExpired
    ? daysOverdue === 1
      ? '1 day overdue'
      : `${daysOverdue} days overdue`
    : daysLeft === 0
    ? 'Due today'
    : daysLeft === 1
    ? '1 day left'
    : `${daysLeft} days left`;

  const barColor = isDone
    ? 'bg-emerald-500'
    : isExpired
    ? 'bg-red-500'
    : isNearDue
    ? 'bg-amber-400'
    : 'bg-indigo-500';

  const trackColor = isDone
    ? 'bg-emerald-100 dark:bg-emerald-950/30'
    : isExpired
    ? 'bg-red-100 dark:bg-red-950/30'
    : isNearDue
    ? 'bg-amber-100 dark:bg-amber-950/20'
    : 'bg-slate-100 dark:bg-slate-800/60';

  const textColor = isDone
    ? 'text-emerald-600 dark:text-emerald-400'
    : isExpired
    ? 'text-red-500 dark:text-red-400'
    : isNearDue
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-400 dark:text-slate-500';

  // C — pulse class on urgent/overdue
  const shouldPulse = isExpired || (t.priority === 'URGENT' && isNearDue);

  // D — tooltip content
  const tooltipLines = [
    `📅 Due: ${new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    `⏱ Created: ${new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    isDone ? '✅ Task completed' : isExpired ? `🔴 ${label}` : `⏳ ${label}`,
    `📊 ${Math.round(rawTimePct)}% of time elapsed`,
  ].join('\n');

  return (
    <div className="w-full mt-1.5 group/progress relative">
      {/* D — tooltip */}
      <div
        className="absolute bottom-full left-0 mb-2 z-20 hidden group-hover/progress:block pointer-events-none"
        role="tooltip"
      >
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e1e1e] shadow-lg px-3 py-2.5 text-[11px] font-medium text-slate-600 dark:text-slate-350 whitespace-pre leading-relaxed min-w-[200px]">
          {tooltipLines}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Progress track */}
        <div className={`relative h-1.5 flex-1 rounded-full overflow-hidden ${trackColor} ${shouldPulse ? 'animate-pulse' : ''}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Label */}
        <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${textColor}`}>
          {label}
        </span>

        {/* I — quick push buttons (appear on hover, only for non-done tasks) */}
        {!isDone ? (
          <span className="hidden group-hover/progress:inline-flex items-center gap-1 shrink-0">
            <button
              type="button"
              title="Push deadline +7 days"
              onClick={(e) => pushDeadline(7, e)}
              disabled={updateTask.isPending}
              className="text-[9px] font-bold rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400 transition-all disabled:opacity-50"
            >
              +7d
            </button>
            <button
              type="button"
              title="Push deadline +14 days"
              onClick={(e) => pushDeadline(14, e)}
              disabled={updateTask.isPending}
              className="text-[9px] font-bold rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400 transition-all disabled:opacity-50"
            >
              +14d
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
