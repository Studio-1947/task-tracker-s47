import { Link } from 'react-router-dom';
import { TASK_STATUSES, type AuditEntry, type StatusCounts } from '@task-tracker/shared';
import { useAdminDashboard, useMemberDashboard } from '../hooks/useDashboard';
import { useAuth } from '../stores/auth';
import { ApiRequestError } from '../lib/api';
import { Card, ErrorState, Spinner } from '../components/ui';
import { describeAudit, formatDate, formatDateTime, isOverdue, priorityClasses, statusClasses, statusLabel } from '../lib/format';

export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Welcome, {user?.name}</h1>
      <p className="mt-1 text-sm text-slate-400">{isAdmin ? 'Admin overview' : 'Your tasks and workspaces'}</p>
      {isAdmin ? <AdminView /> : <MemberView />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'danger' }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>
        {value}
      </div>
    </Card>
  );
}

function StatusBreakdown({ counts }: { counts: StatusCounts }) {
  const total = TASK_STATUSES.reduce((s, k) => s + counts[k], 0);
  return (
    <Card className="p-5">
      <div className="mb-3 text-sm font-medium text-slate-600">Tasks by status</div>
      <div className="space-y-2">
        {TASK_STATUSES.map((s) => {
          const pct = total ? Math.round((counts[s] / total) * 100) : 0;
          return (
            <div key={s} className="flex items-center gap-3">
              <span className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${statusClasses[s]}`}>
                {statusLabel(s)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 text-right text-sm text-slate-500">{counts[s]}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ActivityFeed({ items }: { items: AuditEntry[] }) {
  return (
    <Card className="p-5">
      <div className="mb-3 text-sm font-medium text-slate-600">Recent activity</div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No activity yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-slate-600">{describeAudit(e)}</span>
              {e.taskRef ? <span className="font-mono text-xs text-slate-400">{e.taskRef}</span> : null}
              <span className="text-xs text-slate-400">{formatDateTime(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function AdminView() {
  const { data, isLoading, error } = useAdminDashboard(true);
  if (isLoading) return <Spinner />;
  if (error) return <div className="mt-6"><ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} /></div>;
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Workspaces" value={data.totalWorkspaces} />
        <Stat label="Users" value={data.totalUsers} />
        <Stat label="Overdue tasks" value={data.overdueTasks} tone={data.overdueTasks > 0 ? 'danger' : undefined} />
        <Stat label="Most active" value={data.mostActiveWorkspace?.name ?? '—'} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StatusBreakdown counts={data.tasksByStatus} />
        <ActivityFeed items={data.recentActivity} />
      </div>
    </div>
  );
}

function MemberView() {
  const { data, isLoading, error } = useMemberDashboard(true);
  if (isLoading) return <Spinner />;
  if (error) return <div className="mt-6"><ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} /></div>;
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Assigned to me" value={data.myTasks.length} />
        <Stat label="My workspaces" value={data.myWorkspaceCount} />
        <Stat label="Workspace tasks" value={data.myWorkspaceTaskCount} />
      </div>

      <Card className="p-5">
        <div className="mb-3 text-sm font-medium text-slate-600">My tasks</div>
        {data.myTasks.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing assigned to you right now.</p>
        ) : (
          <div className="space-y-2">
            {data.myTasks.map((t) => (
              <Link
                key={t.id}
                to={`/workspaces/${t.workspaceId}`}
                className="block rounded-lg border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm sm:flex sm:items-center sm:gap-3 sm:px-4"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 sm:flex-1 min-w-0">
                  {/* Primary Row: Ref, Title, Mobile Status */}
                  <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0 sm:flex-1">
                    <span className="font-mono text-xs text-slate-400 w-12 sm:w-16 shrink-0">{t.ref}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{t.title}</span>
                    <span className="sm:hidden shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses[t.status]}`}>{statusLabel(t.status)}</span>
                    </span>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0 sm:gap-3">
                    <span className="text-xs text-slate-400">{t.workspaceName}</span>
                    {t.dueDate ? (
                      <span className={`text-xs ${isOverdue(t.dueDate) ? 'font-medium text-red-600' : 'text-slate-400'}`}>
                        {formatDate(t.dueDate)}
                      </span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityClasses[t.priority]}`}>{t.priority}</span>
                    <span className="hidden sm:inline">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses[t.status]}`}>{statusLabel(t.status)}</span>
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
