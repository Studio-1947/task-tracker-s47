import { useState } from 'react';
import type { ProjectSummary } from '@task-tracker/shared';
import { useCreateProject } from '../hooks/useProjects';
import { ApiRequestError } from '../lib/api';
import { Button, Input } from './ui';

interface Props {
  workspaceId: string;
  onClose: () => void;
  onCreated?: (project: ProjectSummary) => void;
}

export function CreateProjectModal({ workspaceId, onClose, onCreated }: Props) {
  const create = useCreateProject(workspaceId);
  const [name, setName] = useState('');
  const [taskPrefix, setTaskPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const prefix = taskPrefix.trim().toUpperCase();
    if (prefix && !/^[A-Z]{2,6}$/.test(prefix)) {
      setError('Prefix must be 2-6 letters (e.g. WEB)');
      return;
    }
    setError(null);
    try {
      const project = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        taskPrefix: prefix || undefined,
      });
      onCreated?.(project);
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create project');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={onClose} />
      <div className="relative z-[60] w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181818] shadow-xl dark:shadow-none animate-scale-up">
        <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">New project</h2>
            <button
              type="button"
              aria-label="Close"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition"
              onClick={onClose}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website" required autoFocus />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Task prefix <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Input
              value={taskPrefix}
              onChange={(e) => setTaskPrefix(e.target.value.toUpperCase())}
              placeholder="Auto (e.g. WEB → WEB-12)"
              maxLength={6}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Description</label>
            <textarea
              aria-label="Project description"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
