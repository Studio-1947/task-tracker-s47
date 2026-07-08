import { useState } from 'react';
import { PRIORITIES, TASK_STATUSES, type LabelRef, type Priority, type TaskStatus, type UserRef } from '@task-tracker/shared';
import { useCreateTask } from '../hooks/useTasks';
import { ApiRequestError } from '../lib/api';
import { statusLabel } from '../lib/format';
import { Button, Input } from './ui';

interface Props {
  workspaceId: string;
  members: UserRef[];
  labels: LabelRef[];
  onClose: () => void;
}

export function CreateTaskModal({ workspaceId, members, labels, onClose }: Props) {
  const createTask = useCreateTask(workspaceId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggleLabel = (id: string) =>
    setLabelIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      await createTask.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assigneeIds: assigneeId ? [assigneeId] : [],
        labelIds,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create task');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs animate-fade-in" onClick={onClose} />

      {/* Modal content */}
      <div className="relative z-50 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl animate-scale-up">
        <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-800">New task</h2>
            <button
              type="button"
              aria-label="Close"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
              onClick={onClose}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Description</label>
            <textarea
              aria-label="Task description"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">Status</span>
              <select
                aria-label="Status"
                className="w-full rounded-md border border-slate-300 px-2 py-2"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">Priority</span>
              <select
                aria-label="Priority"
                className="w-full rounded-md border border-slate-300 px-2 py-2"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">Assignee</span>
              <select
                aria-label="Assignee"
                className="w-full rounded-md border border-slate-300 px-2 py-2"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">Due date</span>
              <input
                aria-label="Due date"
                type="date"
                className="w-full rounded-md border border-slate-300 px-2 py-2"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </div>

          {labels.length ? (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">Labels</div>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const on = labelIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLabel(l.id)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        on ? 'border-transparent' : 'border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                      style={on ? { backgroundColor: `${l.color ?? '#64748b'}1a`, color: l.color ?? '#64748b' } : undefined}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? 'Creating…' : 'Create task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
