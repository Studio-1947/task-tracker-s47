import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { useCreateWorkspace, useWorkspaces } from '../hooks/useWorkspaces';
import { useAuth } from '../stores/auth';
import { Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';

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
    <div className="animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Workspaces</h1>
      </div>

      {isAdmin ? (
        <Card className="mt-6 p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
          <form className="flex items-end gap-3.5" onSubmit={onCreate}>
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New workspace</label>
              <Input
                placeholder="e.g. Engineering"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="px-6 py-3 font-semibold" disabled={createWorkspace.isPending}>
              {createWorkspace.isPending ? 'Creating…' : 'Create'}
            </Button>
          </form>
          {formError ? <p className="mt-2 text-sm text-red-650 dark:text-red-400 font-medium">{formError}</p> : null}
        </Card>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
        ) : data && data.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((w) => (
              <Link key={w.id} to={`/workspaces/${w.id}`} className="block">
                <Card className="p-6 transition-all duration-200 hover:-translate-y-1.5 hover:border-indigo-500 dark:hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/[0.02] bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-lg truncate">{w.name}</div>
                      <div className="mt-1.5 inline-block font-mono bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded text-slate-500 dark:text-slate-455">{w.taskPrefix}</div>
                    </div>
                    {w.isArchived ? (
                      <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/30">
                        Archived
                      </span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/30">
                        Active
                      </span>
                    )}
                  </div>
                  {w.description ? <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{w.description}</p> : null}
                  <div className="mt-6 text-xs font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    {w.memberCount ?? 0} members
                  </div>
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
