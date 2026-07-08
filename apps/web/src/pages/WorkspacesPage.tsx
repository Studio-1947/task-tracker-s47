import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { useCreateWorkspace, useWorkspaces } from '../hooks/useWorkspaces';
import { useAuth } from '../stores/auth';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';

export function WorkspacesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data, isLoading, error } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await createWorkspace.mutateAsync({ name });
      setName('');
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to create workspace');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Workspaces</h1>
      </div>

      {isAdmin ? (
        <Card className="mt-6 p-5">
          <form className="flex items-end gap-3" onSubmit={onCreate}>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-slate-600">New workspace</label>
              <Input
                placeholder="e.g. Engineering"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={createWorkspace.isPending}>
              {createWorkspace.isPending ? 'Creating…' : 'Create'}
            </Button>
          </form>
          {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        </Card>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
        ) : data && data.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((w) => (
              <Link key={w.id} to={`/workspaces/${w.id}`} className="block">
                <Card className="p-5 transition hover:border-indigo-300 hover:shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-800">{w.name}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{w.taskPrefix}</div>
                    </div>
                    {w.isArchived ? <Badge tone="amber">Archived</Badge> : <Badge tone="green">Active</Badge>}
                  </div>
                  {w.description ? <p className="mt-3 text-sm text-slate-500">{w.description}</p> : null}
                  <div className="mt-4 text-xs text-slate-400">{w.memberCount ?? 0} members</div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No workspaces yet"
            hint={isAdmin ? 'Create your first workspace above.' : 'Ask an admin to add you to a workspace.'}
          />
        )}
      </div>
    </div>
  );
}
