import { useRef, useState } from 'react';
import { useUsers } from '../hooks/useUsers';
import { useWorkspace, useWorkspaceMembers } from '../hooks/useTasks';
import {
  useRemoveWorkspaceLogo,
  useUpdateWorkspace,
  useUpdateWorkspaceMembers,
  useUploadWorkspaceLogo,
} from '../hooks/useWorkspaces';
import { useProjects, useUpdateProject } from '../hooks/useProjects';
import { ApiRequestError } from '../lib/api';
import { Avatar } from './Avatar';
import { AuthImage } from './AuthImage';
import { CreateProjectModal } from './CreateProjectModal';
import { Badge, Button, Input, Spinner } from './ui';

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

interface Props {
  workspaceId: string;
  onClose: () => void;
}

export function WorkspaceSettings({ workspaceId, onClose }: Props) {
  const { data: workspace, isLoading } = useWorkspace(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: allUsers } = useUsers();
  const { data: projects } = useProjects(workspaceId);
  const updateWorkspace = useUpdateWorkspace(workspaceId);
  const updateMembers = useUpdateWorkspaceMembers(workspaceId);
  const updateProject = useUpdateProject(workspaceId);
  const uploadLogo = useUploadWorkspaceLogo(workspaceId);
  const removeLogo = useRemoveWorkspaceLogo(workspaceId);

  const [name, setName] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  // Seed local edit state from the loaded workspace once.
  const nameVal = name ?? workspace?.name ?? '';
  const subtitleVal = subtitle ?? workspace?.subtitle ?? '';
  const descVal = description ?? workspace?.description ?? '';

  const memberIds = new Set((members ?? []).map((m) => m.id));
  const addableUsers = (allUsers ?? []).filter((u) => u.isActive && !memberIds.has(u.id));

  const saveDetails = async () => {
    setError(null);
    try {
      await updateWorkspace.mutateAsync({
        name: nameVal,
        subtitle: subtitleVal || null,
        description: descVal || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to save');
    }
  };

  const onPickLogo = async (file: File | undefined) => {
    setImgError(null);
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setImgError('Image must be 2 MB or smaller.');
      if (logoInput.current) logoInput.current.value = '';
      return;
    }
    try {
      await uploadLogo.mutateAsync(file);
    } catch (err) {
      setImgError(err instanceof ApiRequestError ? err.message : 'Upload failed');
    } finally {
      if (logoInput.current) logoInput.current.value = '';
    }
  };

  const onRemoveLogo = async () => {
    setImgError(null);
    try {
      await removeLogo.mutateAsync();
    } catch (err) {
      setImgError(err instanceof ApiRequestError ? err.message : 'Failed to remove image');
    }
  };

  const imgBusy = uploadLogo.isPending || removeLogo.isPending;

  const toggleArchive = () => {
    if (!workspace) return;
    updateWorkspace.mutate({ isArchived: !workspace.isArchived });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={onClose} />

      {/* Drawer content */}
      <div className="relative z-50 flex h-full w-[calc(100%-3rem)] sm:w-full sm:max-w-md flex-col overflow-y-auto border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181818] shadow-xl animate-slide-in">
        {isLoading || !workspace ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Workspace settings</h2>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition"
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
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Name</label>
                <Input value={nameVal} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Subtitle</label>
                <Input
                  value={subtitleVal}
                  placeholder="e.g. Core engineering team"
                  maxLength={200}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Description</label>
                <textarea
                  aria-label="Workspace description"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
                  rows={3}
                  value={descVal}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
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

            {/* Branding — logo + cover image (admin) */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Branding</h3>

              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                  {workspace.logoKey ? (
                    <AuthImage path={`/files/${workspace.logoKey}`} alt="" className="h-full w-full object-cover" fallback="Logo" />
                  ) : (
                    'Logo'
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Logo</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <input
                      ref={logoInput}
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="hidden"
                      aria-label="Choose workspace logo"
                      onChange={(e) => void onPickLogo(e.target.files?.[0])}
                    />
                    <Button variant="ghost" className="py-1.5 px-3 text-xs" disabled={imgBusy} onClick={() => logoInput.current?.click()}>
                      {workspace.logoKey ? 'Change' : 'Upload'}
                    </Button>
                    {workspace.logoKey ? (
                      <Button variant="danger" className="py-1.5 px-3 text-xs" disabled={imgBusy} onClick={() => void onRemoveLogo()}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {imgError ? <p className="text-sm text-red-600 dark:text-red-400">{imgError}</p> : null}
            </section>

            {/* Members */}
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Members ({members?.length ?? 0})
              </h3>
              <div className="flex gap-2">
                <select
                  aria-label="Add user to workspace"
                  className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
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

              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-850 dark:divide-slate-800">
                {(members ?? []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar user={m} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{m.name}</div>
                        <div className="truncate text-xs text-slate-400 dark:text-slate-500">{m.email}</div>
                      </div>
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
                  <li className="py-3 text-sm text-slate-400 dark:text-slate-500">No members yet. Add someone above.</li>
                ) : null}
              </ul>
            </section>

            {/* Projects */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Projects ({projects?.length ?? 0})
                </h3>
                <Button className="py-1.5 px-3 text-xs" onClick={() => setShowCreateProject(true)}>
                  + New project
                </Button>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {(projects ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color ?? '#6366f1' }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                          {p.name}
                          {p.isArchived ? <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">archived</span> : null}
                        </div>
                        <div className="truncate text-xs text-slate-400 dark:text-slate-500">
                          <span className="font-mono">{p.taskPrefix}</span> · {p.taskCount ?? 0} task(s)
                        </div>
                      </div>
                    </div>
                    <Button
                      variant={p.isArchived ? 'ghost' : 'danger'}
                      className="py-1 px-2.5 text-xs"
                      disabled={updateProject.isPending}
                      onClick={() => updateProject.mutate({ id: p.id, patch: { isArchived: !p.isArchived } })}
                    >
                      {p.isArchived ? 'Unarchive' : 'Archive'}
                    </Button>
                  </li>
                ))}
                {projects?.length === 0 ? (
                  <li className="py-3 text-sm text-slate-400 dark:text-slate-500">No projects yet.</li>
                ) : null}
              </ul>
            </section>
          </div>
        )}
      </div>

      {showCreateProject ? (
        <CreateProjectModal workspaceId={workspaceId} onClose={() => setShowCreateProject(false)} />
      ) : null}
    </div>
  );
}
