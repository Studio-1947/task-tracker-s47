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
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs animate-fade-in" onClick={onClose} />

      {/* Drawer content */}
      <div className="relative z-50 flex h-full w-[calc(100%-3rem)] sm:w-[36rem] max-w-xl flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl animate-slide-in">
        {isLoading || !task ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-400">{task.ref}</div>
                <h2 className="mt-1 text-lg font-semibold text-slate-800 break-words">{task.title}</h2>
              </div>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Status</span>
                <select
                  aria-label="Status"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5"
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
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Priority</span>
                <select
                  aria-label="Priority"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5"
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
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Due date</span>
                <input
                  aria-label="Due date"
                  type="date"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5"
                  value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                  onChange={(e) =>
                    patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Assignee</span>
                <select
                  aria-label="Assignee"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5"
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
              <div className="mb-1 text-sm font-medium text-slate-600">Description</div>
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

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Comments</h3>
              <div className="space-y-3">
                {comments?.length ? (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium text-slate-700">{c.user.name}</span>
                        <span className="text-xs text-slate-400">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-600">{c.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No comments yet.</p>
                )}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  addComment.mutate(comment, { onSuccess: () => setComment('') });
                }}
              >
                <input
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button type="submit" disabled={addComment.isPending}>
                  Send
                </Button>
              </form>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">History</h3>
              <ol className="space-y-2 border-l border-slate-200 pl-4">
                {history?.map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
                    <span className="text-slate-600">{describeAudit(h)}</span>
                    <span className="ml-2 text-xs text-slate-400">{formatDateTime(h.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="text-xs text-slate-400">
              Created by {task.createdBy.name} · {formatDate(task.createdAt)}
              <span className="mx-1">·</span>
              <span className={`rounded-full px-2 py-0.5 ${statusClasses[task.status]}`}>{statusLabel(task.status)}</span>
              <span className={`ml-1 rounded-full px-2 py-0.5 ${priorityClasses[task.priority]}`}>{task.priority}</span>
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
      <div className="mb-1 text-sm font-medium text-slate-600">Labels</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {allLabels.length === 0 ? <span className="text-sm text-slate-400">No labels yet.</span> : null}
        {allLabels.map((l) => {
          const on = selectedIds.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                on ? 'border-transparent' : 'border-slate-200 text-slate-400 hover:border-slate-300'
              }`}
              style={on ? { backgroundColor: `${l.color ?? '#64748b'}1a`, color: l.color ?? '#64748b' } : undefined}
            >
              {l.name}
            </button>
          );
        })}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={onCreate}>
        <input
          className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm"
          placeholder="New label…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" variant="ghost" disabled={createLabel.isPending}>
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
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a description…"
      />
      {dirty ? (
        <div className="mt-1 flex gap-2">
          <Button onClick={() => onSave(text)}>Save</Button>
          <Button variant="ghost" onClick={() => setText(value)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
