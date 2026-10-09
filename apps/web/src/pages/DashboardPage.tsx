import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  TASK_STATUSES,
  type AuditEntry,
  type MyTaskItem,
  type OverdueTaskRow,
  type StatusCounts,
  type UpcomingDeadline,
  type WorkloadEntry,
  type WorkspacePerformance,
  type ReviewQueueItem,
  type LeaveRequestItem,
} from '@task-tracker/shared';
import {
  useAdminDashboard,
  useMemberDashboard,
} from '../hooks/useDashboard';
import { useReviewQueue } from '../hooks/useTasks';
import { useLeaves } from '../hooks/useAttendance';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAuth } from '../stores/auth';
import { useWorkspaceContext } from '../stores/workspace-context';
import { ApiRequestError } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { MetricFilterBar, MetricsPanel, type MetricFilters } from '../components/MetricsPanel';
import { LineChart } from '../components/charts';
import { Badge, Card, ErrorState, Spinner } from '../components/ui';
import {
  describeAudit,
  formatDate,
  formatDateTime,
  isOverdue,
  priorityClasses,
  statusClasses,
  statusLabel,
} from '../lib/format';

export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Welcome back, {user?.name}
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-400 font-medium">
          {isAdmin
            ? 'Enterprise Workspace Operations Control Center'
            : 'Your active board targets and workspace summaries'}
        </p>
      </div>
      {isAdmin ? <AdminView /> : <MemberView />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  to,
  scope,
}: {
  label: string;
  value: number | string;
  tone?: 'danger';
  to?: string;
  scope?: string;
}) {
  const body = (
    <Card className="h-full p-6 hover:shadow-lg hover:shadow-indigo-500/[0.02] hover:-translate-y-0.5 transition-all duration-150 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-slate-400">
        {label}
      </h2>
      <div
        className={`mt-2.5 font-extrabold tracking-tight [overflow-wrap:anywhere] ${typeof value === 'string' && value.length > 8 ? 'text-lg leading-snug sm:text-xl' : 'text-3xl'} ${tone === 'danger' ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </div>
      {scope ? (
        <div className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400">
          {scope}
        </div>
      ) : null}
    </Card>
  );
  if (!to) return body;
  const cls =
    'block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
  const aria = `${label}: ${value}. Show the records`;
  return to.startsWith('#') ? (
    <a href={to} className={cls} aria-label={aria}>
      {body}
    </a>
  ) : (
    <Link to={to} className={cls} aria-label={aria}>
      {body}
    </Link>
  );
}

function StatusBreakdown({ counts }: { counts: StatusCounts }) {
  const total = TASK_STATUSES.reduce((s, k) => s + counts[k], 0);
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
        Tasks by status
      </h2>
      <div className="space-y-3">
        {TASK_STATUSES.map((s) => {
          const pct = total ? Math.round((counts[s] / total) * 100) : 0;
          return (
            <div key={s} className="flex items-center gap-3">
              <span
                className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider ${statusClasses[s]}`}
              >
                {statusLabel(s)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                <div
                  className="h-full rounded-full bg-indigo-500 dark:bg-indigo-600 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs font-bold text-slate-500 dark:text-slate-400">
                {counts[s]}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ActivityFeed({ items }: { items: AuditEntry[] }) {
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
        Recent activity
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-400 py-2">No activity recorded yet.</p>
      ) : (
        <ol className="space-y-4">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-3 text-sm">
              <Avatar
                user={e.user}
                size="sm"
                className="mt-0.5 ring-2 ring-slate-100 dark:ring-slate-800/40"
              />
              <span className="min-w-0 flex-1">
                <span className="text-slate-650 dark:text-slate-300 font-medium leading-relaxed">
                  {describeAudit(e)}
                </span>
                <span className="block mt-0.5 text-[11px] text-slate-400 dark:text-slate-400 font-medium">
                  {e.taskRef ? (
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px] mr-1.5">
                      {e.taskRef}
                    </span>
                  ) : null}
                  {formatDateTime(e.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function WeeklyCompletionCard({ points }: { points: AdminData['weeklyCompletion'] }) {
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
        Weekly completion rate
      </div>
      <LineChart points={points} />
    </Card>
  );
}

function TeamWorkloadCard({ entries }: { entries: WorkloadEntry[] }) {
  const sortedEntries = [...entries].sort((a, b) => b.totalEstimatedMinutes - a.totalEstimatedMinutes);
  const maxWorkload = sortedEntries.length > 0 ? (sortedEntries[0]?.totalEstimatedMinutes || sortedEntries[0]?.openTasks || 1) : 1;

  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
          Team workload (open tasks assigned)
        </h2>
        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Scale: Estimated Time
        </span>
      </div>
      {sortedEntries.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-400 py-2">No tasks assigned yet.</p>
      ) : (
        <div className="space-y-4">
          {sortedEntries.map((e) => {
            const hours = Math.floor(e.totalEstimatedMinutes / 60);
            const mins = e.totalEstimatedMinutes % 60;
            const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
            
            const value = e.totalEstimatedMinutes || e.openTasks;
            const percent = maxWorkload === 0 ? 0 : Math.min(100, Math.round((value / maxWorkload) * 100));

            const gradient = `conic-gradient(#6366f1 0% ${percent}%, #f1f5f9 ${percent}% 100%)`;
            const darkGradient = `conic-gradient(#4f46e5 0% ${percent}%, #262626 ${percent}% 100%)`;

            return (
              <div key={e.user.id} className="flex items-center gap-4">
                <Link to={`/meetings?assignee=${e.user.id}`} className="flex min-w-0 items-center gap-3 w-40 shrink-0 hover:opacity-80 transition-opacity">
                  <Avatar user={e.user} size="sm" className="ring-2 ring-slate-100 dark:ring-slate-800/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {e.user.name}
                    </p>
                  </div>
                </Link>
                
                <div className="flex-1" />

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="relative flex items-center justify-center rounded-full shrink-0" style={{ width: 36, height: 36 }}>
                    <div className="absolute inset-0 rounded-full dark:hidden" style={{ background: gradient }} />
                    <div className="absolute inset-0 rounded-full hidden dark:block" style={{ background: darkGradient }} />
                    <div className="absolute inset-[3px] rounded-full bg-white dark:bg-[#181818]" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{percent}%</span>
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      {e.openTasks} tasks ({timeStr}){e.predominantSize ? ` • Mostly ${e.predominantSize.toLowerCase()}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const WORK_STATE: Record<
  WorkspacePerformance['state'],
  { label: string; tone: 'green' | 'amber' | 'slate' }
> = {
  ACTIVE: { label: 'Active', tone: 'green' },
  AWAITING_REVIEW: { label: 'Awaiting review', tone: 'amber' },
  BLOCKED: { label: 'Blocked', tone: 'amber' },
  UPDATE_OVERDUE: { label: 'Update overdue', tone: 'amber' },
  NO_ACTIVE_WORK: { label: 'No active work', tone: 'slate' },
  WEEKLY_OFF: { label: 'Weekly off', tone: 'slate' },
};

function OfficePerformanceCard({ rows }: { rows: WorkspacePerformance[] }) {
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="px-6 pt-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
          Workspace delivery state
        </h2>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
          Client and project workspaces, not physical offices. Accepted means reviewed and closed.
          State is calendar-aware: a weekend is Weekly off, not idle.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 pb-6 pt-3 text-sm text-slate-400 dark:text-slate-400">
          No active workspaces recorded.
        </p>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-900/30 text-left text-[11px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/50">
              <tr>
                <th scope="col" className="px-6 py-3 font-semibold">
                  Workspace
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Open
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Accepted
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Progress
                </th>
                <th scope="col" className="px-6 py-3 font-semibold">
                  State
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
              {rows.map((w) => {
                const st = WORK_STATE[w.state];
                return (
                  <tr
                    key={w.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <Link
                        to={`/workspaces/${w.id}`}
                        className="flex items-center gap-2.5 font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: w.color ?? '#6366f1' }}
                        />
                        {w.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 font-medium">
                      {w.openTasks}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 font-medium">
                      {w.completedTasks} of {w.totalTasks}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-9 text-right font-bold text-slate-700 dark:text-slate-350">
                          {w.totalTasks ? `${w.completionPct}%` : 'n/a'}
                        </span>
                        <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                          <div
                            className="h-full rounded-full bg-indigo-500 dark:bg-indigo-600 transition-all"
                            style={{ width: `${w.completionPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {w.state !== 'BLOCKED' && w.blockedTasks > 0 ? (
                          <Badge tone="amber">{w.blockedTasks} blocked</Badge>
                        ) : null}
                        {w.state !== 'AWAITING_REVIEW' && w.awaitingReviewTasks > 0 ? (
                          <Badge tone="amber">{w.awaitingReviewTasks} in review</Badge>
                        ) : null}
                        {w.state !== 'UPDATE_OVERDUE' && w.updateOverdueTasks > 0 ? (
                          <Badge tone="amber">{w.updateOverdueTasks} need an update</Badge>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function deadlineChip(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** G — At-Risk summary card showing overdue, due-this-week and on-track task counts. */
function AtRiskCard({
  overdueCount,
  noDeadlineCount,
  upcoming,
  myTasks,
}: {
  /** Real overdue count from the dashboard's single overdue query (PRD §10 D01) — never derived from `upcoming`, which by construction excludes overdue tasks. */
  overdueCount?: number;
  noDeadlineCount?: number;
  upcoming?: UpcomingDeadline[];
  myTasks?: MyTaskItem[];
}) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  let overdue = 0;
  let dueThisWeek = 0;
  let onTrack = 0;
  let noDeadline = 0;
  let total = 0;

  if (myTasks && myTasks.length > 0) {
    total = myTasks.length;
    for (const t of myTasks) {
      if (t.status === 'DONE') continue;
      if (!t.dueDate) {
        noDeadline++;
        continue;
      }
      const due = new Date(t.dueDate).getTime();
      if (due < now) overdue++;
      else if (due - now <= weekMs) dueThisWeek++;
    }
    onTrack = Math.max(0, total - overdue - dueThisWeek - noDeadline);
  } else {
    // Admin: `upcoming` only ever holds tasks not yet due (dueInDays >= 0),
    // so "overdue" must come from the dashboard's own overdue query, not be
    // re-derived from it — that mismatch is the exact bug this replaces.
    overdue = overdueCount ?? 0;
    noDeadline = noDeadlineCount ?? 0;
    const items = upcoming ?? [];
    dueThisWeek = items.filter((t) => t.dueInDays <= 7).length;
    onTrack = items.filter((t) => t.dueInDays > 7).length;
    total = overdue + items.length + noDeadline;
  }

  const rows = [
    {
      icon: '🔴',
      label: 'Overdue',
      count: overdue,
      color: overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-400',
      bar: overdue > 0 ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700',
    },
    {
      icon: '🟡',
      label: 'Due this week',
      count: dueThisWeek,
      color:
        dueThisWeek > 0
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-400 dark:text-slate-400',
      bar: dueThisWeek > 0 ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700',
    },
    {
      icon: '🟢',
      label: 'On track',
      count: onTrack,
      color: 'text-emerald-600 dark:text-emerald-400',
      bar: 'bg-emerald-500',
    },
    {
      icon: '⚪',
      label: 'No deadline',
      count: noDeadline,
      color: 'text-slate-500 dark:text-slate-400',
      bar: 'bg-slate-300 dark:bg-slate-600',
    },
  ];

  const barTotal = total || 1;

  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
          ⚠️ At-Risk Tasks
        </h2>
        {overdue > 0 && (
          <span className="ml-auto rounded-full bg-red-100 dark:bg-red-950/30 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 animate-pulse">
            {overdue} overdue
          </span>
        )}
      </div>
      <div className="space-y-3.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="text-sm shrink-0">{row.icon}</span>
            <span className={`w-28 shrink-0 text-xs font-semibold ${row.color}`}>{row.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
              <div
                className={`h-full rounded-full transition-all duration-500 ${row.bar}`}
                style={{ width: `${Math.round((row.count / barTotal) * 100)}%` }}
              />
            </div>
            <span className={`w-6 text-right text-xs font-bold tabular-nums ${row.color}`}>
              {row.count}
            </span>
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-400">
          No upcoming deadlines tracked.
        </p>
      )}
    </Card>
  );
}

/**
 * Drill-down for the "Overdue tasks" headline Stat — same query, same
 * request (PRD §10/§12 D01, AT01: the card must open the exact records
 * behind its count). `total` can exceed `items.length` when there are more
 * overdue tasks than the drill-down page size.
 */
function OverdueTaskListCard({ items, total }: { items: OverdueTaskRow[]; total: number }) {
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
          Overdue tasks
        </h2>
        {total > 0 ? (
          <span className="rounded-full bg-red-100 dark:bg-red-950/30 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
            {total}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-400 py-2">Nothing overdue.</p>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/workspaces/${t.workspaceId}?task=${t.id}`}
              className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white/50 dark:border-slate-800/40 dark:bg-slate-900/30 p-3.5 hover:border-red-500 dark:hover:border-red-500/50 hover:shadow-md hover:shadow-red-500/[0.02] hover:-translate-y-0.5 transition-all duration-150"
            >
              <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-950/20 dark:text-red-400">
                {t.overdueWorkingMinutes !== null
                  ? `${Math.max(1, Math.round(t.overdueWorkingMinutes / 60 / 8))} day(s) overdue`
                  : 'Overdue'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t.title}
                </p>
                <p className="mt-1 text-xs text-slate-450 dark:text-slate-400 font-medium">
                  <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded text-[10px] mr-1">
                    {t.ref}
                  </span>{' '}
                  · {t.workspaceName} · due {formatDate(t.dueDate)}
                </p>
              </div>
            </Link>
          ))}
          {total > items.length ? (
            <p className="pt-1 text-xs text-slate-400 dark:text-slate-400">
              +{total - items.length} more overdue, not shown
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function PendingReviewsCard({ items }: { items: ReviewQueueItem[] }) {
  const total = items.length;
  const previewItems = items.slice(0, 5);
  
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
          Pending reviews
        </h2>
        {total > 0 ? (
          <span className="rounded-full bg-amber-100 dark:bg-amber-950/30 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 animate-pulse">
            {total}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-400 py-2">No pending reviews.</p>
      ) : (
        <div className="space-y-3">
          {previewItems.map((t) => (
            <Link
              key={t.submissionId}
              to={`/workspaces/${t.workspaceId}?task=${t.taskId}`}
              className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white/50 dark:border-slate-800/40 dark:bg-slate-900/30 p-3.5 hover:border-amber-500 dark:hover:border-amber-500/50 hover:shadow-md hover:shadow-amber-500/[0.02] hover:-translate-y-0.5 transition-all duration-150"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t.taskTitle}
                </p>
                <p className="mt-1 text-xs text-slate-450 dark:text-slate-400 font-medium">
                  <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded text-[10px] mr-1">
                    {t.taskRef}
                  </span>{' '}
                  · {t.workspaceName} · submitted by {t.submitter.name}
                </p>
              </div>
            </Link>
          ))}
          {total > previewItems.length ? (
            <Link to="/reviews" className="block pt-1 text-xs text-indigo-500 hover:underline">
              View all {total} pending reviews &rarr;
            </Link>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function UpcomingDeadlinesCard({ items }: { items: UpcomingDeadline[] }) {
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
        Upcoming deadlines
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-400 py-2">
          Nothing due in the next two weeks.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/workspaces/${t.workspaceId}?task=${t.id}`}
              className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white/50 dark:border-slate-800/40 dark:bg-slate-900/30 p-3.5 hover:border-indigo-500 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/[0.02] hover:-translate-y-0.5 transition-all duration-150"
            >
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  t.dueInDays <= 1
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                }`}
              >
                {deadlineChip(t.dueInDays)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t.title}
                </p>
                <p className="mt-1 text-xs text-slate-450 dark:text-slate-400 font-medium">
                  <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded text-[10px] mr-1">
                    {t.ref}
                  </span>{' '}
                  · {t.workspaceName} · due {formatDate(t.dueDate)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

type AdminData = NonNullable<ReturnType<typeof useAdminDashboard>['data']>;

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function ApprovedLeaveCalendar({ leaves }: { leaves: LeaveRequestItem[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const byDate = new Map<string, LeaveRequestItem[]>();
  for (const leave of leaves) {
    const start = new Date(`${leave.startDate}T00:00:00`);
    const end = new Date(`${leave.endDate}T00:00:00`);
    for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const key = dateKey(day);
      byDate.set(key, [...(byDate.get(key) ?? []), leave]);
    }
  }
  const cells: Array<number | null> = [
    ...Array<null>(first.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const move = (delta: number) => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} aria-label="Previous leave month" className="rounded-md px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Previous</button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button type="button" onClick={() => move(1)} aria-label="Next leave month" className="rounded-md px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Next</button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{day}</div>)}
        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} className="min-h-24" />;
          const key = `${month}-${String(day).padStart(2, '0')}`;
          const entries = byDate.get(key) ?? [];
          return (
            <div key={key} className={`min-h-24 rounded-lg border p-1.5 text-left transition-colors ${key === localDate() ? 'border-indigo-400 ring-1 ring-indigo-400/20 dark:border-indigo-500/60' : 'border-slate-100 bg-white/50 dark:border-slate-800/60 dark:bg-slate-900/20'}`}>
              <div className={`mb-1 text-xs font-bold ${key === localDate() ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{day}</div>
              <div className="space-y-1">
                {entries.slice(0, 3).map((leave) => (
                  <div key={leave.id} title={`${leave.user.name} - ${leave.typeName}${leave.reason ? `: ${leave.reason}` : ''}`} className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-200" style={{ backgroundColor: `${leave.color ?? '#6366f1'}24`, borderLeft: `2px solid ${leave.color ?? '#6366f1'}` }}>
                    <Avatar user={leave.user} size="sm" className="h-4 w-4 text-[7px]" />
                    <span className="truncate">{leave.user.name} - {leave.typeName}{leave.halfDay ? ' (1/2)' : ''}</span>
                  </div>
                ))}
                {entries.length > 3 ? <div className="px-1 text-[10px] font-semibold text-slate-400">+{entries.length - 3} more</div> : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Each entry shows the person and leave type. Hover an entry to see its reason.</p>
    </div>
  );
}

/** Approved leave is operational information, so this is rendered only from the admin dashboard. */
function ApprovedLeaveCard({ leaves, isLoading }: { leaves: LeaveRequestItem[] | undefined; isLoading: boolean }) {
  const today = localDate();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const upcoming = (leaves ?? [])
    .filter((leave) => leave.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.user.name.localeCompare(b.user.name));

  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Approved leave</h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">People currently away or scheduled to be away.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold dark:bg-slate-800">
            <button type="button" onClick={() => setView('list')} className={`rounded-md px-2.5 py-1 ${view === 'list' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>List</button>
            <button type="button" onClick={() => setView('calendar')} className={`rounded-md px-2.5 py-1 ${view === 'calendar' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>Calendar</button>
          </div>
          <Link to="/attendance" className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Manage leave</Link>
        </div>
      </div>
      {isLoading ? (
        <div className="py-4"><Spinner /></div>
      ) : upcoming.length === 0 ? (
        <p className="py-2 text-sm text-slate-400 dark:text-slate-400">No current or upcoming approved leave.</p>
      ) : view === 'calendar' ? (
        <ApprovedLeaveCalendar leaves={upcoming} />
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {upcoming.map((leave) => {
            const isCurrent = leave.startDate <= today;
            const dates = leave.startDate === leave.endDate
              ? formatDate(leave.startDate)
              : `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`;
            return (
              <li key={leave.id} className="rounded-xl border border-slate-100 bg-white/50 p-3 dark:border-slate-800/50 dark:bg-slate-900/20">
                <div className="flex items-start gap-3">
                  <Avatar user={leave.user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{leave.user.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isCurrent ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                        {isCurrent ? 'On leave' : 'Upcoming'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{dates}{leave.halfDay ? ' · Half day' : ''} · {leave.typeName}</p>
                    <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Reason: </span>{leave.reason || 'No reason provided'}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function AdminView() {
  const { data: workspaces } = useWorkspaces();
  const workspaceContextIds = useWorkspaceContext((state) => state.workspaceIds);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<MetricFilters>({
    workspaceId: '',
    period: '30d',
    basis: 'ORIGINAL',
  });
  const requestedWorkspaceId = searchParams.get('workspace') ?? '';
  const activeWorkspaces = (workspaces ?? []).filter((w) => !w.isArchived);
  const requestedWorkspace = activeWorkspaces.some((w) => w.id === requestedWorkspaceId)
    ? requestedWorkspaceId
    : '';
  const { data, isLoading, error } = useAdminDashboard(true, workspaceContextIds);
  const { data: approvedLeaves, isLoading: isLeavesLoading } = useLeaves('APPROVED');
  // Default the delivery metrics to the workspace people are actually working in, not whichever sorts first alphabetically.
  const activeIds = new Set(activeWorkspaces.map((w) => w.id));
  const busiest =
    data?.mostActiveWorkspace && activeIds.has(data.mostActiveWorkspace.id)
      ? data.mostActiveWorkspace.id
      : '';
  const firstWorkspace = busiest || (workspaces ?? []).find((w) => !w.isArchived)?.id || '';
  const selectedWorkspaceId =
    workspaceContextIds[0] || requestedWorkspace || filters.workspaceId || firstWorkspace;
  const hasWorkspaceScope = workspaceContextIds.length > 0;
  const metricFilters: MetricFilters = { ...filters, workspaceId: selectedWorkspaceId };
  
  const { data: reviewQueue } = useReviewQueue();
  const visibleReviewQueue = (reviewQueue ?? []).filter(
    (item) => workspaceContextIds.length === 0 || workspaceContextIds.includes(item.workspaceId),
  );
  const changeFilters = (next: MetricFilters) => {
    setFilters(next);
    if (next.workspaceId !== selectedWorkspaceId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('workspace', next.workspaceId);
      setSearchParams(nextParams, { replace: true });
    }
  };
  if (isLoading) return <Spinner />;
  if (error)
    return (
      <div className="mt-6">
        <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
      </div>
    );
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6 animate-fade-in">
      <MetricFilterBar value={metricFilters} onChange={changeFilters} />

      {/* Exceptions first: what needs a decision today. */}
      <section aria-label="Needs attention" className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AtRiskCard overdueCount={data.overdueTasks} noDeadlineCount={data.noDeadlineTasks} upcoming={data.upcomingDeadlines} />
          <UpcomingDeadlinesCard items={data.upcomingDeadlines} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div id="overdue-list" className="scroll-mt-20">
            <OverdueTaskListCard items={data.overdueTaskList} total={data.overdueTasks} />
          </div>
          <div id="pending-reviews" className="scroll-mt-20">
            <PendingReviewsCard items={visibleReviewQueue} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat
            label="Pending reviews"
            value={visibleReviewQueue.length}
            tone={visibleReviewQueue.length > 0 ? 'danger' : undefined}
            to="/reviews"
            scope={
              hasWorkspaceScope
                ? 'Selected workspace(s) queue'
                : 'All workspaces pending reviews'
            }
          />
          <Stat
            label="Overdue commitments"
            value={data.overdueTasks}
            tone={data.overdueTasks > 0 ? 'danger' : undefined}
            to="#overdue-list"
            scope={
              hasWorkspaceScope
                ? 'Selected workspace(s), open tasks, live'
                : 'All workspaces, open tasks, live'
            }
          />
          <Stat
            label="Workspaces"
            value={data.totalWorkspaces}
            to="/workspaces"
            scope={hasWorkspaceScope ? 'Selected workspace scope' : 'Active, not archived'}
          />
          <Stat
            label="Active users"
            value={data.totalUsers}
            to="/users"
            scope={hasWorkspaceScope ? 'Selected workspace members' : 'Organisation-wide'}
          />
          <Stat
            label="Most active workspace"
            value={data.mostActiveWorkspace?.name ?? '-'}
            scope={hasWorkspaceScope ? 'Selected workspace activity' : 'By activity, last 7 days'}
          />
        </div>
      </section>

      <MetricsPanel filters={metricFilters} />
      <ApprovedLeaveCard leaves={approvedLeaves} isLoading={isLeavesLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TeamWorkloadCard entries={data.teamWorkload} />
        <WeeklyCompletionCard points={data.weeklyCompletion} />
      </div>
      <OfficePerformanceCard rows={data.workspacePerformance} />
      <StatusBreakdown counts={data.tasksByStatus} />
      {/* Supporting context, deliberately last. */}
      <ActivityFeed items={data.recentActivity} />
    </div>
  );
}



function MemberView() {
  const { data, isLoading, error } = useMemberDashboard(true);
  if (isLoading) return <Spinner />;
  if (error)
    return (
      <div className="mt-6">
        <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
      </div>
    );
  if (!data) return null;

  const overdue = data.myTasks.filter((t) => t.dueDate && isOverdue(t.dueDate)).length;
  const staleIds = new Set(data.updateOverdueTaskIds);

  return (
    <div className="mt-6 space-y-6 animate-fade-in">
      {/* Exceptions first: what needs me today. Every card says its scope and opens its records. */}
      <section aria-label="Needs my attention" className="space-y-6">
        <AtRiskCard myTasks={data.myTasks} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Overdue"
            value={overdue}
            tone={overdue > 0 ? 'danger' : undefined}
            to="#my-tasks"
            scope="My open tasks past their deadline"
          />
          <Stat
            label="Updates due"
            value={data.updateOverdueTaskIds.length}
            tone={data.updateOverdueTaskIds.length > 0 ? 'danger' : undefined}
            to="#my-tasks"
            scope="In progress, no update in working time"
          />
          <Stat
            label="Reviews waiting on me"
            value={data.reviewsWaiting}
            to="/reviews"
            scope="Submissions I review"
          />
          <Stat label="Blocked on me" value={data.blockedOnMe} scope="Blockers I am named to clear" />
        </div>
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Assigned to me" value={data.myTasks.length} scope="Open, not archived" />
        <Stat label="My workspaces" value={data.myWorkspaceCount} to="/workspaces" />
        <Stat
          label="Workspace tasks"
          value={data.myWorkspaceTaskCount}
          scope="Active tasks in my workspaces"
        />
      </div>

      <Card className="scroll-mt-20 p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
        <div
          id="my-tasks"
          className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400"
        >
          My tasks
        </div>
        {data.myTasks.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-400 py-2">
            No tasks assigned to you currently.
          </p>
        ) : (
          <div className="space-y-3">
            {data.myTasks.map((t) => (
              <Link
                key={t.id}
                to={`/workspaces/${t.workspaceId}?task=${t.id}`}
                className="block rounded-xl border border-slate-100 bg-white/50 dark:border-slate-800/40 dark:bg-slate-900/30 p-3.5 hover:border-indigo-500 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/[0.02] hover:-translate-y-0.5 transition-all duration-150 sm:flex sm:items-center sm:gap-4 sm:px-5"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4 sm:flex-1 min-w-0">
                  {/* Primary Row: Ref, Title, Mobile Status */}
                  <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0 sm:flex-1">
                    <span className="font-mono text-xs text-slate-400 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded w-16 text-center shrink-0">
                      {t.ref}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">
                      {t.title}
                    </span>
                    <span className="sm:hidden shrink-0">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses[t.status]}`}
                      >
                        {statusLabel(t.status)}
                      </span>
                    </span>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0 sm:gap-4">
                    <span className="text-xs text-slate-450 dark:text-slate-400 font-semibold">
                      {t.workspaceName}
                    </span>
                    {staleIds.has(t.id) ? <Badge tone="amber">Update overdue</Badge> : null}
                    {t.dueDate ? (
                      <span
                        className={`text-xs font-semibold ${isOverdue(t.dueDate) ? 'text-red-500 dark:text-red-400' : 'text-slate-450 dark:text-slate-400'}`}
                      >
                        {formatDate(t.dueDate)}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${priorityClasses[t.priority]}`}
                    >
                      {t.priority}
                    </span>
                    <span className="hidden sm:inline">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses[t.status]}`}
                      >
                        {statusLabel(t.status)}
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StatusBreakdown counts={data.tasksByStatus} />
        <ActivityFeed items={data.recentActivity} />
      </div>
    </div>
  );
}
