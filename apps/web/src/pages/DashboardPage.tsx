import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAuth } from '../stores/auth';
import { Card, ErrorState, Spinner } from '../components/ui';
import { ApiRequestError } from '../lib/api';

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useWorkspaces();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Welcome, {user?.name}</h1>
      <p className="mt-1 text-sm text-slate-400">
        {user?.role === 'ADMIN' ? 'Admin overview' : 'Your workspaces at a glance'}
      </p>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="mt-6">
          <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Workspaces" value={data?.length ?? 0} />
          <Stat
            label="Members total"
            value={(data ?? []).reduce((sum, w) => sum + (w.memberCount ?? 0), 0)}
          />
          <Stat label="Archived" value={(data ?? []).filter((w) => w.isArchived).length} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-slate-800">{value}</div>
    </Card>
  );
}
