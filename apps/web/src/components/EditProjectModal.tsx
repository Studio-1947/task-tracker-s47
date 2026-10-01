import { useState } from 'react';
import type { ProjectSummary } from '@task-tracker/shared';
import { useUpdateProject } from '../hooks/useProjects';
import { ApiRequestError } from '../lib/api';
import { Button, Input } from './ui';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

/** Edit a project's name, description and colour, or archive it. The task prefix is fixed so existing task IDs keep working. */
export function EditProjectModal({
  workspaceId,
  project,
  onClose,
  onArchived,
}: {
  workspaceId: string;
  project: ProjectSummary;
  onClose: () => void;
  onArchived?: () => void;
}) {
  const update = useUpdateProject(workspaceId);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [color, setColor] = useState<string | null>(project.color);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== project.name || description.trim() !== (project.description ?? '') || color !== project.color;

  const run = async (patch: Parameters<typeof update.mutateAsync>[0]['patch'], after?: () => void) => {
    setError(null);
    try {
      await update.mutateAsync({ id: project.id, patch });
      after?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the project');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Edit project">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs" onClick={onClose} />
      <form
        className="relative z-50 w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-[#181818]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !dirty) return;
          void run({ name: name.trim(), description: description.trim() || null, color });
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit project</h2>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-500 dark:bg-slate-800" title="Task IDs keep this prefix">{project.taskPrefix}</span>
        </div>
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
          Name
          <Input className="mt-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
          Description
          <textarea
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-[#252525] dark:text-white"
            placeholder="The intended result of this project"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">Colour</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Project colour">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="danger"
            disabled={update.isPending}
            onClick={() => {
              if (window.confirm(`Archive "${project.name}"? Its tasks are kept and it can be restored from Manage.`)) void run({ isArchived: true }, onArchived);
            }}
          >
            Archive
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || !dirty || update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
