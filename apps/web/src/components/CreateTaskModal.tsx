import { useState } from 'react';
import { taskSizeLabel, TASK_SIZE_LABELS, PRIORITIES, TASK_STATUSES, type LabelRef, type Priority, type ProjectSummary, type TaskStatus, type UserRef } from '@task-tracker/shared';
import { useCreateTask } from '../hooks/useTasks';
import { nonWorkingReason, useCalendar } from '../hooks/useCalendar';
import { ApiRequestError } from '../lib/api';
import { statusLabel } from '../lib/format';
import { AssigneePicker } from './AssigneePicker';
import { TextLinkButton } from './TextLinkButton';
import { Button, Input } from './ui';

interface Props {
  workspaceId: string;
  members: UserRef[];
  labels: LabelRef[];
  projects: ProjectSummary[];
  defaultProjectId?: string;
  onClose: () => void;
}

export function CreateTaskModal({ workspaceId, members, labels, projects, defaultProjectId, onClose }: Props) {
  const createTask = useCreateTask(workspaceId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [estimateHours, setEstimateHours] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const { data: calendar } = useCalendar();
  const offDayReason = dueDate ? nonWorkingReason(dueDate, calendar) : null;
  const sizeLabel = taskSizeLabel(estimateHours ? Math.round(Number(estimateHours) * 60) : null);
  const [error, setError] = useState<string | null>(null);

  const toggleLabel = (id: string) =>
    setLabelIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!projectId) {
      setError('Please select a project');
      return;
    }
    if (!dueDate) {
      setError('Please set a due date');
      return;
    }
    setError(null);
    try {
      await createTask.mutateAsync({
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        acceptanceCriteria: acceptanceCriteria.trim() || undefined,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assigneeIds,
        ownerId: ownerId || null,
        reviewerId: reviewerId || null,
        baselineEstimateMinutes: estimateHours ? Math.round(Number(estimateHours) * 60) : null,
        labelIds,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create task');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs animate-fade-in" onClick={onClose} />

      {/* Modal content */}
      <div className="relative z-50 w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181818] shadow-xl dark:shadow-none animate-scale-up">
        <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">New task</h2>
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
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Project</label>
            <select
              aria-label="Project"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 bg-white dark:bg-[#252525] dark:text-white"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.length === 0 ? <option value="">No projects</option> : null}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.taskPrefix})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={1000} required autoFocus />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Up to 1,000 characters.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Description</label>
            <textarea
              aria-label="Task description"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="mt-2"><TextLinkButton value={description} onChange={setDescription} /></div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Acceptance criteria</label>
            <textarea
              aria-label="Acceptance criteria"
              rows={2}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white"
              placeholder="How will the reviewer decide this is complete?"
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
            />
          </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Status</span>
              <select
                aria-label="Status"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 bg-white dark:bg-[#252525] dark:text-white"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s} disabled={!!reviewerId && (s === 'IN_REVIEW' || s === 'DONE')}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Priority</span>
              <select
                aria-label="Priority"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 bg-white dark:bg-[#252525] dark:text-white"
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
            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Tag people</span>
              <p className="mb-1.5 text-xs text-slate-400 dark:text-slate-500">Select as many people as needed.</p>
              <AssigneePicker
                members={members}
                selected={members.filter((m) => assigneeIds.includes(m.id))}
                onChange={setAssigneeIds}
                emptyLabel="No people tagged"
                pluralLabel="people tagged"
              />
            </div>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Accountable owner</span>
              <select className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 bg-white dark:bg-[#252525] dark:text-white" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Not assigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {!ownerId && assigneeIds.length > 0 ? (
                <span className="mt-1 block text-[11px] font-medium text-amber-600 dark:text-amber-400">Tagged people are collaborators. Pick one accountable owner.</span>
              ) : null}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Reviewer</span>
              <select className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 bg-white dark:bg-[#252525] dark:text-white" value={reviewerId} onChange={(e) => { setReviewerId(e.target.value); if (e.target.value && (status === 'IN_REVIEW' || status === 'DONE')) setStatus('IN_PROGRESS'); }}>
                <option value="">Not assigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 flex items-center justify-between font-medium text-slate-600 dark:text-slate-300">
                Baseline estimate (hours)
                {sizeLabel ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{TASK_SIZE_LABELS[sizeLabel]}</span> : null}
              </span>
              <input type="number" min="0" step="0.25" className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 bg-white dark:bg-[#252525] dark:text-white" value={estimateHours} onChange={(e) => setEstimateHours(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 flex items-center gap-0.5 font-medium text-slate-600 dark:text-slate-300">
                Due date
                <span className="text-red-500 ml-0.5">*</span>
              </span>
              <input
                aria-label="Due date"
                type="date"
                required
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-2 bg-white dark:bg-[#252525] dark:text-white"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              {offDayReason ? (
                <span role="alert" className="mt-1 block text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  This date is {offDayReason}. Prefer a working day, or note why in the description.
                </span>
              ) : null}
            </label>
          </div>

          {Number(estimateHours) > 2 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              ⚠️ <strong>Task breakup recommendation:</strong> Estimated effort exceeds 120 minutes (2 hours). Consider splitting this deliverable into smaller subtasks.
            </div>
          ) : null}

          {labels.length ? (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">Labels</div>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const on = labelIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLabel(l.id)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                        on ? 'border-transparent' : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
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

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
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
