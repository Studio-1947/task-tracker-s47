import { useState } from 'react';
import {
  PRIORITIES,
  TASK_STATUSES,
  type LabelRef,
  type Priority,
  type TaskStatus,
  type UserRef,
} from '@task-tracker/shared';
import {
  useAddComment,
  useTask,
  useTaskComments,
  useTaskHistory,
  useUpdateTask,
} from '../hooks/useTasks';
import { useCreateLabel } from '../hooks/useLabels';
import { describeAudit, formatDate, formatDateTime, priorityClasses, statusClasses, statusLabel } from '../lib/format';
import { Attachments } from './Attachments';
import { Avatar } from './Avatar';
import { Button, Spinner } from './ui';

interface Props {
  workspaceId: string;
  taskId: string;
  members: UserRef[];
  labels: LabelRef[];
  onClose: () => void;
}

export function TaskDrawer({ workspaceId, taskId, members, labels, onClose }: Props) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: comments } = useTaskComments(taskId);
  const { data: history } = useTaskHistory(taskId);
  const update = useUpdateTask(workspaceId);
  const addComment = useAddComment(taskId);
  const [comment, setComment] = useState('');

  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: taskId, patch: p });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-[#090d16]/50 dark:bg-[#121212]/80 backdrop-blur-md animate-fade-in" onClick={onClose} />

      {/* Drawer content */}
      <div className="relative z-50 flex h-full w-[calc(100%-3rem)] sm:w-[36rem] max-w-xl flex-col overflow-y-auto border-l border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#181818] shadow-2xl animate-slide-in">
        {isLoading || !task ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded text-center">{task.ref}</span>
                  <span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{task.projectName}</span>
                </div>
                <h2 className="mt-2.5 text-lg font-bold text-slate-800 dark:text-white break-words leading-snug">{task.title}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                onClick={onClose}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                <span className="mb-1.5 block">Status</span>
                <select
                  aria-label="Status"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold text-sm"
                  value={task.status}
                  onChange={(e) => patch({ status: e.target.value as TaskStatus })}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                <span className="mb-1.5 block">Priority</span>
                <select
                  aria-label="Priority"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold text-sm"
                  value={task.priority}
                  onChange={(e) => patch({ priority: e.target.value as Priority })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                <span className="mb-1.5 block">Due date</span>
                <input
                  aria-label="Due date"
                  type="date"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold text-sm"
                  value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                  onChange={(e) =>
                    patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </label>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                <span className="mb-1.5 block">Assignee</span>
                <select
                  aria-label="Assignee"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold text-sm"
                  value={task.assignees[0]?.id ?? ''}
                  onChange={(e) => patch({ assigneeIds: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Description</div>
              <DescriptionEditor
                value={task.description ?? ''}
                onSave={(v) => patch({ description: v || null })}
              />
            </div>

            <LabelPicker
              workspaceId={workspaceId}
              allLabels={labels}
              selected={task.labels}
              onChange={(labelIds) => patch({ labelIds })}
            />

            <Attachments taskId={taskId} workspaceId={workspaceId} />

            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Comments</h3>
              <div className="space-y-3">
                {comments?.length ? (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-xl bg-slate-50/50 dark:bg-[#222222]/50 p-4 border border-slate-100 dark:border-slate-800/40 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar user={c.user} size="sm" className="ring-2 ring-white dark:ring-slate-850" />
                          <span className="truncate font-semibold text-slate-700 dark:text-slate-200">{c.user.name}</span>
                        </span>
                        <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-slate-650 dark:text-slate-300 leading-relaxed">{c.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-1.5">No comments recorded yet.</p>
                )}
              </div>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  addComment.mutate(comment, { onSuccess: () => setComment('') });
                }}
              >
                <input
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button type="submit" className="py-2 px-4" disabled={addComment.isPending}>
                  Send
                </Button>
              </form>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">History Log</h3>
              <ol className="space-y-3.5 border-l-2 border-slate-100 dark:border-slate-800/80 pl-4">
                {history?.map((h) => (
                  <li key={h.id} className="relative text-xs font-medium leading-relaxed">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-650" />
                    <span className="text-slate-600 dark:text-slate-350">{describeAudit(h)}</span>
                    <span className="ml-2.5 text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{formatDateTime(h.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/40 pt-4 mt-2">
              Created by {task.createdBy.name} · {formatDate(task.createdAt)}
              <span className="mx-2">·</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusClasses[task.status]}`}>{statusLabel(task.status)}</span>
              <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${priorityClasses[task.priority]}`}>{task.priority}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LabelPicker({
  workspaceId,
  allLabels,
  selected,
  onChange,
}: {
  workspaceId: string;
  allLabels: LabelRef[];
  selected: LabelRef[];
  onChange: (labelIds: string[]) => void;
}) {
  const createLabel = useCreateLabel(workspaceId);
  const [newName, setNewName] = useState('');
  const selectedIds = new Set(selected.map((l) => l.id));

  const toggle = (labelId: string) => {
    const next = selectedIds.has(labelId)
      ? [...selectedIds].filter((x) => x !== labelId)
      : [...selectedIds, labelId];
    onChange(next);
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createLabel.mutate(
      { name },
      {
        onSuccess: (label) => {
          setNewName('');
          onChange([...selectedIds, label.id]);
        },
      },
    );
  };

  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Labels</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {allLabels.length === 0 ? <span className="text-sm text-slate-400 dark:text-slate-500 py-1">No labels yet.</span> : null}
        {allLabels.map((l) => {
          const on = selectedIds.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition cursor-pointer ${
                on ? 'border-transparent' : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700 hover:bg-slate-50/50'
              }`}
              style={on ? { backgroundColor: `${l.color ?? '#64748b'}1a`, color: l.color ?? '#64748b' } : undefined}
            >
              {l.name}
            </button>
          );
        })}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={onCreate}>
        <input
          className="w-40 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
          placeholder="New label…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" variant="ghost" className="py-1.5 px-3 text-xs" disabled={createLabel.isPending}>
          Add
        </Button>
      </form>
    </div>
  );
}

function DescriptionEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  const dirty = text !== value;
  return (
    <div>
      <textarea
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a description…"
      />
      {dirty ? (
        <div className="mt-2.5 flex gap-2">
          <Button className="py-2 px-4" onClick={() => onSave(text)}>Save</Button>
          <Button variant="ghost" className="py-2 px-4" onClick={() => setText(value)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
