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
} from '@task-tracker/shared';
import { useAdminDashboard, useMemberDashboard, useWednesdayReport, useFridayReport, useApproveReport, useCreateReportDraft, useDistributeReport } from '../hooks/useDashboard';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAuth } from '../stores/auth';
import { apiBlob, ApiRequestError } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { MetricFilterBar, MetricsPanel, type MetricFilters } from '../components/MetricsPanel';
import { HBarList, LineChart } from '../components/charts';
import { Badge, Button, Card, ErrorState, Spinner } from '../components/ui';
import { describeAudit, formatDate, formatDateTime, formatWorkingDuration, isOverdue, priorityClasses, statusClasses, statusLabel } from '../lib/format';

export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Welcome back, {user?.name}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">{isAdmin ? 'Enterprise Workspace Operations Control Center' : 'Your active board targets and workspace summaries'}</p>
      </div>
      {isAdmin ? <AdminView /> : <MemberView />}
    </div>
  );
}

function Stat({ label, value, tone, to, scope }: { label: string; value: number | string; tone?: 'danger'; to?: string; scope?: string }) {
  const body = (
    <Card className="h-full p-6 hover:shadow-lg hover:shadow-indigo-500/[0.02] hover:-translate-y-0.5 transition-all duration-150 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-slate-500">{label}</div>
      <div
        className={`mt-2.5 font-extrabold tracking-tight [overflow-wrap:anywhere] ${typeof value === 'string' && value.length > 8 ? 'text-lg leading-snug sm:text-xl' : 'text-3xl'} ${tone === 'danger' ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </div>
      {scope ? <div className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">{scope}</div> : null}
    </Card>
  );
  if (!to) return body;
  const cls = 'block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
  const aria = `${label}: ${value}. Show the records`;
  return to.startsWith('#') ? (
    <a href={to} className={cls} aria-label={aria}>{body}</a>
  ) : (
    <Link to={to} className={cls} aria-label={aria}>{body}</Link>
  );
}

function StatusBreakdown({ counts }: { counts: StatusCounts }) {
  const total = TASK_STATUSES.reduce((s, k) => s + counts[k], 0);
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Tasks by status</div>
      <div className="space-y-3">
        {TASK_STATUSES.map((s) => {
          const pct = total ? Math.round((counts[s] / total) * 100) : 0;
          return (
            <div key={s} className="flex items-center gap-3">
              <span className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider ${statusClasses[s]}`}>
                {statusLabel(s)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                <div className="h-full rounded-full bg-indigo-500 dark:bg-indigo-600 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 text-right text-xs font-bold text-slate-500 dark:text-slate-400">{counts[s]}</span>
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
      <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Recent activity</div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No activity recorded yet.</p>
      ) : (
        <ol className="space-y-4">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-3 text-sm">
              <Avatar user={e.user} size="sm" className="mt-0.5 ring-2 ring-slate-100 dark:ring-slate-800/40" />
              <span className="min-w-0 flex-1">
                <span className="text-slate-650 dark:text-slate-300 font-medium leading-relaxed">{describeAudit(e)}</span>
                <span className="block mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {e.taskRef ? <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px] mr-1.5">{e.taskRef}</span> : null}
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
      <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Weekly completion rate</div>
      <LineChart points={points} />
    </Card>
  );
}

function TeamWorkloadCard({ entries }: { entries: WorkloadEntry[] }) {
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Team workload (open tasks assigned)</div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No tasks assigned yet.</p>
      ) : (
        <HBarList
          items={entries.map((e) => ({
            key: e.user.id,
            value: e.openTasks,
            label: (
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar user={e.user} size="sm" className="ring-2 ring-slate-100 dark:ring-slate-800/40" />
                <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{e.user.name}</span>
              </span>
            ),
          }))}
        />
      )}
    </Card>
  );
}

const WORK_STATE: Record<WorkspacePerformance['state'], { label: string; tone: 'green' | 'amber' | 'slate' }> = {
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
        <div className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Workspace delivery state</div>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Client and project workspaces, not physical offices. Accepted means reviewed and closed. State is calendar-aware: a weekend is Weekly off, not idle.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 pb-6 pt-3 text-sm text-slate-400 dark:text-slate-500">No active workspaces recorded.</p>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-900/30 text-left text-[11px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
              <tr>
                <th scope="col" className="px-6 py-3 font-semibold">Workspace</th>
                <th scope="col" className="px-4 py-3 font-semibold">Open</th>
                <th scope="col" className="px-4 py-3 font-semibold">Accepted</th>
                <th scope="col" className="px-4 py-3 font-semibold">Progress</th>
                <th scope="col" className="px-6 py-3 font-semibold">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
              {rows.map((w) => {
                const st = WORK_STATE[w.state];
                return (
                  <tr key={w.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link to={`/workspaces/${w.id}`} className="flex items-center gap-2.5 font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: w.color ?? '#6366f1' }} />
                        {w.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 font-medium">{w.openTasks}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 font-medium">{w.completedTasks} of {w.totalTasks}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-9 text-right font-bold text-slate-700 dark:text-slate-350">{w.totalTasks ? `${w.completionPct}%` : 'n/a'}</span>
                        <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                          <div className="h-full rounded-full bg-indigo-500 dark:bg-indigo-600 transition-all" style={{ width: `${w.completionPct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {w.state !== 'BLOCKED' && w.blockedTasks > 0 ? <Badge tone="amber">{w.blockedTasks} blocked</Badge> : null}
                        {w.state !== 'AWAITING_REVIEW' && w.awaitingReviewTasks > 0 ? <Badge tone="amber">{w.awaitingReviewTasks} in review</Badge> : null}
                        {w.state !== 'UPDATE_OVERDUE' && w.updateOverdueTasks > 0 ? <Badge tone="amber">{w.updateOverdueTasks} need an update</Badge> : null}
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
  upcoming,
  myTasks,
}: {
  /** Real overdue count from the dashboard's single overdue query (PRD §10 D01) — never derived from `upcoming`, which by construction excludes overdue tasks. */
  overdueCount?: number;
  upcoming?: UpcomingDeadline[];
  myTasks?: MyTaskItem[];
}) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  let overdue = 0;
  let dueThisWeek = 0;
  let onTrack = 0;
  let total = 0;

  if (myTasks && myTasks.length > 0) {
    total = myTasks.length;
    for (const t of myTasks) {
      if (!t.dueDate || t.status === 'DONE') continue;
      const due = new Date(t.dueDate).getTime();
      if (due < now) overdue++;
      else if (due - now <= weekMs) dueThisWeek++;
    }
    onTrack = Math.max(0, total - overdue - dueThisWeek);
  } else {
    // Admin: `upcoming` only ever holds tasks not yet due (dueInDays >= 0),
    // so "overdue" must come from the dashboard's own overdue query, not be
    // re-derived from it — that mismatch is the exact bug this replaces.
    overdue = overdueCount ?? 0;
    const items = upcoming ?? [];
    dueThisWeek = items.filter((t) => t.dueInDays <= 7).length;
    onTrack = items.filter((t) => t.dueInDays > 7).length;
    total = overdue + items.length;
  }

  const rows = [
    {
      icon: '🔴',
      label: 'Overdue',
      count: overdue,
      color: overdue > 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-400 dark:text-slate-500',
      bar: overdue > 0 ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700',
    },
    {
      icon: '🟡',
      label: 'Due this week',
      count: dueThisWeek,
      color: dueThisWeek > 0
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-400 dark:text-slate-500',
      bar: dueThisWeek > 0 ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700',
    },
    {
      icon: '🟢',
      label: 'On track',
      count: onTrack,
      color: 'text-emerald-600 dark:text-emerald-400',
      bar: 'bg-emerald-500',
    },
  ];

  const barTotal = total || 1;

  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">⚠️ At-Risk Tasks</span>
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
            <span className={`w-6 text-right text-xs font-bold tabular-nums ${row.color}`}>{row.count}</span>
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No upcoming deadlines tracked.</p>
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
        <span className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Overdue tasks</span>
        {total > 0 ? (
          <span className="rounded-full bg-red-100 dark:bg-red-950/30 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">{total}</span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-2">Nothing overdue.</p>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/workspaces/${t.workspaceId}?task=${t.id}`}
              className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white/50 dark:border-slate-800/40 dark:bg-slate-900/30 p-3.5 hover:border-red-500 dark:hover:border-red-500/50 hover:shadow-md hover:shadow-red-500/[0.02] hover:-translate-y-0.5 transition-all duration-150"
            >
              <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-950/20 dark:text-red-400">
                {t.overdueWorkingMinutes !== null ? `${formatWorkingDuration(t.overdueWorkingMinutes)} overdue` : 'Overdue'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{t.title}</p>
                <p className="mt-1 text-xs text-slate-450 dark:text-slate-500 font-medium">
                  <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded text-[10px] mr-1">{t.ref}</span> · {t.workspaceName} · due {formatDate(t.dueDate)}
                </p>
              </div>
            </Link>
          ))}
          {total > items.length ? (
            <p className="pt-1 text-xs text-slate-400 dark:text-slate-500">+{total - items.length} more overdue, not shown</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function UpcomingDeadlinesCard({ items }: { items: UpcomingDeadline[] }) {
  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Upcoming deadlines</div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-2">Nothing due in the next two weeks.</p>
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
                  t.dueInDays <= 1 ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                }`}
              >
                {deadlineChip(t.dueInDays)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{t.title}</p>
                <p className="mt-1 text-xs text-slate-450 dark:text-slate-500 font-medium">
                  <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded text-[10px] mr-1">{t.ref}</span> · {t.workspaceName} · due {formatDate(t.dueDate)}
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

function AdminView() {
  const { data: workspaces } = useWorkspaces();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<MetricFilters>({ workspaceId: '', period: '30d', basis: 'ORIGINAL' });
  const requestedWorkspaceId = searchParams.get('workspace') ?? '';
  const activeWorkspaces = (workspaces ?? []).filter((w) => !w.isArchived);
  const requestedWorkspace = activeWorkspaces.some((w) => w.id === requestedWorkspaceId) ? requestedWorkspaceId : '';
  const { data, isLoading, error } = useAdminDashboard(true, requestedWorkspace || undefined);
  // Default the delivery metrics to the workspace people are actually working in, not whichever sorts first alphabetically.
  const activeIds = new Set(activeWorkspaces.map((w) => w.id));
  const busiest = data?.mostActiveWorkspace && activeIds.has(data.mostActiveWorkspace.id) ? data.mostActiveWorkspace.id : '';
  const firstWorkspace = busiest || (workspaces ?? []).find((w) => !w.isArchived)?.id || '';
  const selectedWorkspaceId = requestedWorkspace || filters.workspaceId || firstWorkspace;
  const metricFilters: MetricFilters = { ...filters, workspaceId: selectedWorkspaceId };
  const changeFilters = (next: MetricFilters) => {
    setFilters(next);
    if (next.workspaceId !== selectedWorkspaceId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('workspace', next.workspaceId);
      setSearchParams(nextParams, { replace: true });
    }
  };
  if (isLoading) return <Spinner />;
  if (error) return <div className="mt-6"><ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} /></div>;
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6 animate-fade-in">
      <MetricFilterBar value={metricFilters} onChange={changeFilters} />

      {/* Exceptions first: what needs a decision today. */}
      <section aria-label="Needs attention" className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Overdue commitments" value={data.overdueTasks} tone={data.overdueTasks > 0 ? 'danger' : undefined} to="#overdue-list" scope="All workspaces, open tasks, live" />
          <Stat label="Workspaces" value={data.totalWorkspaces} to="/workspaces" scope="Active, not archived" />
          <Stat label="Active users" value={data.totalUsers} to="/users" scope="Organisation-wide" />
          <Stat label="Most active workspace" value={data.mostActiveWorkspace?.name ?? '-'} scope="By activity, last 7 days" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AtRiskCard overdueCount={data.overdueTasks} upcoming={data.upcomingDeadlines} />
          <UpcomingDeadlinesCard items={data.upcomingDeadlines} />
        </div>
        <div id="overdue-list" className="scroll-mt-20">
          <OverdueTaskListCard items={data.overdueTaskList} total={data.overdueTasks} />
        </div>
      </section>

      <MetricsPanel filters={metricFilters} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TeamWorkloadCard entries={data.teamWorkload} />
        <WeeklyCompletionCard points={data.weeklyCompletion} />
      </div>
      <OfficePerformanceCard rows={data.workspacePerformance} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlyReportDownloads />
        <OperationalDraftReportsCard />
      </div>
      <StatusBreakdown counts={data.tasksByStatus} />
      {/* Supporting context, deliberately last. */}
      <ActivityFeed items={data.recentActivity} />
    </div>
  );
}

function MonthlyReportDownloads() {
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(nowMonth);
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (format: 'pdf' | 'csv') => {
    setDownloading(format);
    setError(null);
    try {
      const blob = await apiBlob(`/admin/reports/monthly.${format}?month=${month}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `task-tracker-report-${month}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not download the report');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Monthly reporting</div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Download an executive analysis or the full task activity data.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span className="mb-1 block">Report month</span>
          <input type="month" value={month} max={nowMonth} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white" />
        </label>
        <button type="button" disabled={!month || downloading !== null} onClick={() => void download('pdf')} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50">
          {downloading === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
        </button>
        <button type="button" disabled={!month || downloading !== null} onClick={() => void download('csv')} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-slate-200 dark:hover:bg-[#252525]">
          {downloading === 'csv' ? 'Preparing CSV...' : 'Download CSV'}
        </button>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-full">{error}</p> : null}
    </Card>
  );
}

function OperationalDraftReportsCard() {
  const { data: workspaces } = useWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [reportType, setReportType] = useState<'wednesday' | 'friday' | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [distributionMessage, setDistributionMessage] = useState<string | null>(null);
  const createDraft = useCreateReportDraft();
  const approveReport = useApproveReport();
  const distributeReport = useDistributeReport();

  const activeWorkspaces = (workspaces ?? []).filter((w) => !w.isArchived);
  const targetId = selectedWorkspaceId || activeWorkspaces[0]?.id || null;

  const wednesday = useWednesdayReport(reportType === 'wednesday' ? targetId : null);
  const friday = useFridayReport(reportType === 'friday' ? targetId : null);

  const currentReport = reportType === 'wednesday' ? wednesday.data : reportType === 'friday' ? friday.data : null;
  const isLoading = reportType === 'wednesday' ? wednesday.isLoading : reportType === 'friday' ? friday.isLoading : false;

  const saveForApproval = async () => {
    if (!targetId || !reportType) return;
    setDistributionMessage(null);
    const row = await createDraft.mutateAsync({ workspaceId: targetId, reportType: reportType === 'wednesday' ? 'WEDNESDAY_PROGRESS' : 'FRIDAY_OUTCOMES' });
    setSnapshotId(row.id);
    setDistributionMessage('Draft snapshot saved. Review it, then approve before sharing.');
  };

  const approveAndShare = async () => {
    if (!snapshotId) return;
    setDistributionMessage(null);
    await approveReport.mutateAsync(snapshotId);
    const result = await distributeReport.mutateAsync(snapshotId);
    setDistributionMessage(`Approved and shared in-app/push with ${result.delivered} workspace member${result.delivered === 1 ? '' : 's'}.`);
  };

  const downloadReport = (title: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-5 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Weekly Operational Reports</div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Generate Wednesday progress drafts or Friday outcome summaries for any workspace.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            aria-label="Select workspace for report"
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-xs font-semibold dark:text-white flex-1"
            value={selectedWorkspaceId || activeWorkspaces[0]?.id || ''}
            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
          >
            {activeWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            className="py-2 px-3 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
            onClick={() => setReportType('wednesday')}
          >
            📊 Wednesday Draft
          </Button>
          <Button
            variant="ghost"
            className="py-2 px-3 text-xs font-semibold border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400"
            onClick={() => setReportType('friday')}
          >
            🏁 Friday Outcomes
          </Button>
        </div>
      </div>

      {reportType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={() => setReportType(null)} />
          <Card className="relative z-10 w-full max-w-2xl max-h-[85vh] p-6 animate-fade-in bg-white dark:bg-[#1f1f1f] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {reportType === 'wednesday' ? 'Wednesday Mid-Week Progress Draft' : 'Friday Outcomes Draft Report'}
                </h3>
                {currentReport ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Workspace: {currentReport.workspaceName} · Date: {currentReport.reportDate}
                  </p>
                ) : null}
              </div>
              <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => setReportType(null)}>Close</Button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 space-y-3 font-mono text-xs bg-slate-50 dark:bg-[#181818] p-4 rounded-lg border border-slate-200 dark:border-slate-800 whitespace-pre-wrap dark:text-slate-200">
              {isLoading ? (
                <div className="py-8 flex justify-center"><Spinner /></div>
              ) : currentReport ? (
                currentReport.markdown
              ) : (
                <p className="text-slate-400">Failed to load report data.</p>
              )}
            </div>

            {currentReport ? (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                {distributionMessage ? <p className="mb-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">{distributionMessage}</p> : null}
                <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  className="py-1.5 px-3 text-xs"
                  onClick={() => navigator.clipboard.writeText(currentReport.markdown)}
                >
                  Copy Markdown
                </Button>
                <Button
                  className="py-1.5 px-3 text-xs font-semibold"
                  onClick={() => downloadReport(`${currentReport.workspaceName}-${reportType}-report`, currentReport.markdown)}
                >
                  Download .MD File
                </Button>
                <Button variant="ghost" className="py-1.5 px-3 text-xs" disabled={createDraft.isPending} onClick={() => void saveForApproval()}>
                  {createDraft.isPending ? 'Saving...' : 'Save reviewed draft'}
                </Button>
                <Button className="py-1.5 px-3 text-xs font-semibold" disabled={!snapshotId || approveReport.isPending || distributeReport.isPending} onClick={() => void approveAndShare()}>
                  {approveReport.isPending || distributeReport.isPending ? 'Sharing...' : 'Approve & share'}
                </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </Card>
  );
}

function MemberView() {
  const { data, isLoading, error } = useMemberDashboard(true);
  if (isLoading) return <Spinner />;
  if (error) return <div className="mt-6"><ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} /></div>;
  if (!data) return null;

  const overdue = data.myTasks.filter((t) => t.dueDate && isOverdue(t.dueDate)).length;
  const staleIds = new Set(data.updateOverdueTaskIds);

  return (
    <div className="mt-6 space-y-6 animate-fade-in">
      {/* Exceptions first: what needs me today. Every card says its scope and opens its records. */}
      <section aria-label="Needs my attention" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? 'danger' : undefined} to="#my-tasks" scope="My open tasks past their deadline" />
        <Stat label="Updates due" value={data.updateOverdueTaskIds.length} tone={data.updateOverdueTaskIds.length > 0 ? 'danger' : undefined} to="#my-tasks" scope="In progress, no update in working time" />
        <Stat label="Reviews waiting on me" value={data.reviewsWaiting} to="/reviews" scope="Submissions I review" />
        <Stat label="Blocked on me" value={data.blockedOnMe} scope="Blockers I am named to clear" />
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Assigned to me" value={data.myTasks.length} scope="Open, not archived" />
        <Stat label="My workspaces" value={data.myWorkspaceCount} to="/workspaces" />
        <Stat label="Workspace tasks" value={data.myWorkspaceTaskCount} scope="Active tasks in my workspaces" />
      </div>

      <Card className="scroll-mt-20 p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
        <div id="my-tasks" className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">My tasks</div>
        {data.myTasks.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No tasks assigned to you currently.</p>
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
                    <span className="font-mono text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded w-16 text-center shrink-0">{t.ref}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">{t.title}</span>
                    <span className="sm:hidden shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses[t.status]}`}>{statusLabel(t.status)}</span>
                    </span>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0 sm:gap-4">
                    <span className="text-xs text-slate-450 dark:text-slate-500 font-semibold">{t.workspaceName}</span>
                    {staleIds.has(t.id) ? <Badge tone="amber">Update overdue</Badge> : null}
                    {t.dueDate ? (
                      <span className={`text-xs font-semibold ${isOverdue(t.dueDate) ? 'text-red-500 dark:text-red-400' : 'text-slate-450 dark:text-slate-500'}`}>
                        {formatDate(t.dueDate)}
                      </span>
                    ) : null}
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${priorityClasses[t.priority]}`}>{t.priority}</span>
                    <span className="hidden sm:inline">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses[t.status]}`}>{statusLabel(t.status)}</span>
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
      {/* G — At-Risk widget for member (my tasks overdue/near-due) */}
      <AtRiskCard myTasks={data.myTasks} />
    </div>
  );
}
