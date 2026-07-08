import { useState } from 'react';
import { useUsers } from '../hooks/useUsers';
import { useWorkspace, useWorkspaceMembers } from '../hooks/useTasks';
import { useUpdateWorkspace, useUpdateWorkspaceMembers } from '../hooks/useWorkspaces';
import { ApiRequestError } from '../lib/api';
import { Badge, Button, Input, Spinner } from './ui';

interface Props {
  workspaceId: string;
  onClose: () => void;
}

export function WorkspaceSettings({ workspaceId, onClose }: Props) {
  const { data: workspace, isLoading } = useWorkspace(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: allUsers } = useUsers();
  const updateWorkspace = useUpdateWorkspace(workspaceId);
  const updateMembers = useUpdateWorkspaceMembers(workspaceId);

  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed local edit state from the loaded workspace once.
  const nameVal = name ?? workspace?.name ?? '';
  const descVal = description ?? workspace?.description ?? '';

  const memberIds = new Set((members ?? []).map((m) => m.id));
  const addableUsers = (allUsers ?? []).filter((u) => u.isActive && !memberIds.has(u.id));

  const saveDetails = async () => {
    setError(null);
    try {
      await updateWorkspace.mutateAsync({ name: nameVal, description: descVal || undefined });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to save');
    }
  };

  const toggleArchive = () => {
    if (!workspace) return;
    updateWorkspace.mutate({ isArchived: !workspace.isArchived });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs animate-fade-in" onClick={onClose} />

      {/* Drawer content */}
      <div className="relative z-50 flex h-full w-[calc(100%-3rem)] sm:w-full sm:max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl animate-slide-in">
        {isLoading || !workspace ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-800">Workspace settings</h2>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                onClick={onClose}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Details */}
            <section className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
                <Input value={nameVal} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Description</label>
                <textarea
                  aria-label="Workspace description"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                  value={descVal}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex items-center gap-2">
                <Button onClick={saveDetails} disabled={updateWorkspace.isPending}>
                  Save details
                </Button>
                <Button variant={workspace.isArchived ? 'ghost' : 'danger'} onClick={toggleArchive}>
                  {workspace.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
                {workspace.isArchived ? <Badge tone="amber">Archived</Badge> : null}
              </div>
            </section>

            {/* Members */}
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Members ({members?.length ?? 0})
              </h3>
              <div className="flex gap-2">
                <select
                  aria-label="Add user to workspace"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                >
                  <option value="">Add a user…</option>
                  {addableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <Button
                  disabled={!addUserId || updateMembers.isPending}
                  onClick={() => {
                    updateMembers.mutate(
                      { add: [addUserId] },
                      { onSuccess: () => setAddUserId('') },
                    );
                  }}
                >
                  Add
                </Button>
              </div>

              <ul className="mt-3 divide-y divide-slate-100">
                {(members ?? []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-700">{m.name}</div>
                      <div className="truncate text-xs text-slate-400">{m.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{m.role}</Badge>
                      <Button
                        variant="danger"
                        disabled={updateMembers.isPending}
                        onClick={() => updateMembers.mutate({ remove: [m.id] })}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
                {members?.length === 0 ? (
                  <li className="py-3 text-sm text-slate-400">No members yet. Add someone above.</li>
                ) : null}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
