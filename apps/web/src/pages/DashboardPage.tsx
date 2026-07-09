import { Link } from 'react-router-dom';
import {
  TASK_STATUSES,
  type AuditEntry,
  type StatusCounts,
  type UpcomingDeadline,
  type WorkloadEntry,
  type WorkspacePerformance,
} from '@task-tracker/shared';
import { useAdminDashboard, useMemberDashboard } from '../hooks/useDashboard';
import { useAuth } from '../stores/auth';
import { ApiRequestError } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { HBarList, LineChart } from '../components/charts';
import { Badge, Card, ErrorState, Spinner } from '../components/ui';
import { describeAudit, formatDate, formatDateTime, isOverdue, priorityClasses, statusClasses, statusLabel } from '../lib/format';

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

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'danger' }) {
  return (
    <Card className="p-6 hover:shadow-lg hover:shadow-indigo-500/[0.02] hover:-translate-y-0.5 transition-all duration-150 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-slate-500">{label}</div>
      <div className={`mt-2.5 text-3xl font-extrabold tracking-tight ${tone === 'danger' ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
        {value}
      </div>
    </Card>
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

function OfficePerformanceCard({ rows }: { rows: WorkspacePerformance[] }) {
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="px-6 pt-5 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Office-wise performance</div>
      {rows.length === 0 ? (
        <p className="px-6 pb-6 pt-3 text-sm text-slate-400 dark:text-slate-500">No active workspaces recorded.</p>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-900/30 text-left text-[11px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
              <tr>
                <th className="px-6 py-3 font-semibold">Office</th>
                <th className="px-4 py-3 font-semibold">Total tasks</th>
                <th className="px-4 py-3 font-semibold">Completed</th>
                <th className="px-4 py-3 font-semibold">Completion</th>
                <th className="px-6 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
              {rows.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link to={`/workspaces/${w.id}`} className="flex items-center gap-2.5 font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: w.color ?? '#6366f1' }}
                      />
                      {w.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 font-medium">{w.totalTasks}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 font-medium">{w.completedTasks}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-9 text-right font-bold text-slate-700 dark:text-slate-350">{w.completionPct}%</span>
                      <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                        <div className="h-full rounded-full bg-indigo-500 dark:bg-indigo-600 transition-all" style={{ width: `${w.completionPct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    {w.isActive ? <Badge tone="green">Active operations</Badge> : <Badge>Idle</Badge>}
                  </td>
                </tr>
              ))}
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
  const { data, isLoading, error } = useAdminDashboard(true);
  if (isLoading) return <Spinner />;
  if (error) return <div className="mt-6"><ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} /></div>;
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Workspaces" value={data.totalWorkspaces} />
        <Stat label="Users" value={data.totalUsers} />
        <Stat label="Overdue tasks" value={data.overdueTasks} tone={data.overdueTasks > 0 ? 'danger' : undefined} />
        <Stat label="Most active" value={data.mostActiveWorkspace?.name ?? '—'} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WeeklyCompletionCard points={data.weeklyCompletion} />
        <TeamWorkloadCard entries={data.teamWorkload} />
      </div>
      <OfficePerformanceCard rows={data.workspacePerformance} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingDeadlinesCard items={data.upcomingDeadlines} />
        <ActivityFeed items={data.recentActivity} />
      </div>
      <StatusBreakdown counts={data.tasksByStatus} />
    </div>
  );
}

function MemberView() {
  const { data, isLoading, error } = useMemberDashboard(true);
  if (isLoading) return <Spinner />;
  if (error) return <div className="mt-6"><ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} /></div>;
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Assigned to me" value={data.myTasks.length} />
        <Stat label="My workspaces" value={data.myWorkspaceCount} />
        <Stat label="Workspace tasks" value={data.myWorkspaceTaskCount} />
      </div>

      <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
        <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">My tasks</div>
        {data.myTasks.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No tasks assigned to you currently.</p>
        ) : (
          <div className="space-y-3">
            {data.myTasks.map((t) => (
              <Link
                key={t.id}
                to={`/workspaces/${t.workspaceId}`}
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
    </div>
  );
}
