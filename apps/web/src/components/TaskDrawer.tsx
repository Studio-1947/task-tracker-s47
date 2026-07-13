import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  PRIORITIES,
  TASK_STATUSES,
  type LabelRef,
  type Priority,
  type SubtaskRef,
  type TaskStatus,
  type UpdateTaskInput,
  type UserRef,
} from '@task-tracker/shared';
import {
  useAddComment,
  useArchiveTask,
  useCreateSubtask,
  useDeleteTask,
  useRestoreTask,
  useTask,
  useTaskComments,
  useTaskHistory,
  useUpdateTask,
} from '../hooks/useTasks';
import { useCreateLabel } from '../hooks/useLabels';
import { useAuth } from '../stores/auth';
import { describeAudit, formatDate, formatDateTime, priorityClasses, statusClasses, statusLabel } from '../lib/format';
import { ApiRequestError } from '../lib/api';
import { AssigneePicker } from './AssigneePicker';
import { Attachments } from './Attachments';
import { Avatar } from './Avatar';
import { Button, Spinner } from './ui';

interface Props {
  workspaceId: string;
  taskId: string;
  members: UserRef[];
  labels: LabelRef[];
  onClose: () => void;
  /** Opens another task (a subtask or the parent) in this same drawer. */
  onOpenTask: (id: string) => void;
}

export function TaskDrawer({ workspaceId, taskId, members, labels, onClose, onOpenTask }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: task, isLoading } = useTask(taskId);
  const { data: comments } = useTaskComments(taskId);
  const { data: history } = useTaskHistory(taskId);
  const update = useUpdateTask(workspaceId);
  const addComment = useAddComment(taskId);
  const archive = useArchiveTask(workspaceId);
  const restore = useRestoreTask(workspaceId);
  const remove = useDeleteTask(workspaceId);
  const createSubtask = useCreateSubtask(taskId, workspaceId);
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');

  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: taskId, patch: p });

  /** Subtasks live under the parent's ['task', taskId] cache entry, so refresh that too. */
  const patchSubtask = (subtaskId: string, p: UpdateTaskInput) =>
    update.mutate(
      { id: subtaskId, patch: p },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ['task', taskId] }) },
    );

  const toggleSubtask = (subtaskId: string, currentStatus: TaskStatus) =>
    patchSubtask(subtaskId, { status: currentStatus === 'DONE' ? 'TODO' : 'DONE' });

  const onDelete = () => {
    if (!window.confirm(`Permanently delete "${task?.ref} ${task?.title}"? This cannot be undone.`)) return;
    remove.mutate(taskId, { onSuccess: onClose });
  };

  const onAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;
    createSubtask.mutate({ title }, { onSuccess: () => setSubtaskTitle('') });
  };

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
                {task.parentTask ? (
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.parentTask!.id)}
                    className="mb-1.5 flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Subtask of {task.parentTask.ref} {task.parentTask.title}
                  </button>
                ) : null}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded text-center">{task.ref}</span>
                  <span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{task.projectName}</span>
                  {task.isArchived ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      Archived
                    </span>
                  ) : null}
                </div>
                <TitleEditor key={task.id} value={task.title} onSave={(v) => patch({ title: v })} />
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

            <div className="flex flex-wrap items-center gap-2">
              {task.isArchived ? (
                <Button variant="ghost" className="py-1.5 px-3 text-xs" disabled={restore.isPending} onClick={() => restore.mutate(taskId)}>
                  Restore
                </Button>
              ) : (
                <Button variant="ghost" className="py-1.5 px-3 text-xs" disabled={archive.isPending} onClick={() => archive.mutate(taskId)}>
                  Archive
                </Button>
              )}
              {isAdmin ? (
                <Button variant="danger" className="py-1.5 px-3 text-xs" disabled={remove.isPending} onClick={onDelete}>
                  Delete permanently
                </Button>
              ) : null}
              {remove.isError ? (
                <span className="text-xs font-semibold text-red-500 dark:text-red-400">
                  {remove.error instanceof ApiRequestError ? remove.error.message : 'Failed to delete task'}
                </span>
              ) : null}
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
              {/* A task can have any number of assignees (task_assignees is M2M). */}
              <div className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                <span className="mb-1.5 block">Assignees</span>
                <AssigneePicker
                  members={members}
                  selected={task.assignees}
                  onChange={(assigneeIds) => patch({ assigneeIds })}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Description</div>
              <DescriptionEditor
                key={task.id}
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

            {!task.parentTaskId ? (
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                  Subtasks{task.subtasks.length ? ` (${task.subtasks.filter((s) => s.status === 'DONE').length}/${task.subtasks.length})` : ''}
                </h3>
                <div className="space-y-2">
                  {task.subtasks.length ? (
                    task.subtasks.map((s) => (
                      <SubtaskRow
                        key={s.id}
                        subtask={s}
                        members={members}
                        onToggle={() => toggleSubtask(s.id, s.status)}
                        onPatch={(p) => patchSubtask(s.id, p)}
                        onOpen={() => onOpenTask(s.id)}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 dark:text-slate-500 py-1">No subtasks yet.</p>
                  )}
                </div>
                <form className="mt-3 flex gap-2" onSubmit={onAddSubtask}>
                  <input
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-sm bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                    placeholder="Add a subtask…"
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                  />
                  <Button type="submit" variant="ghost" className="py-2 px-4 text-xs" disabled={createSubtask.isPending}>
                    Add
                  </Button>
                </form>
              </section>
            ) : null}

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

/** Click-to-edit task title. Enter saves, Escape reverts. */
function TitleEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  const commit = () => {
    const next = text.trim();
    if (next && next !== value) onSave(next);
    else setText(value);
    setEditing(false);
  };

  const cancel = () => {
    setText(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit title"
        className="group mt-2.5 flex w-full items-start gap-2 text-left cursor-text"
      >
        <h2 className="min-w-0 break-words text-lg font-bold leading-snug text-slate-800 dark:text-white">
          {value}
        </h2>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="mt-1.5 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-500"
        >
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="mt-2.5">
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') cancel();
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-lg font-bold leading-snug text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-[#252525] dark:text-white"
      />
      <div className="mt-2 flex gap-2">
        <Button className="py-1.5 px-3 text-xs" onClick={commit} disabled={!text.trim()}>
          Save
        </Button>
        <Button variant="ghost" className="py-1.5 px-3 text-xs" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** One subtask: check off, rename inline, or reassign — without leaving the parent. */
function SubtaskRow({
  subtask,
  members,
  onToggle,
  onPatch,
  onOpen,
}: {
  subtask: SubtaskRef;
  members: UserRef[];
  onToggle: () => void;
  onPatch: (patch: UpdateTaskInput) => void;
  onOpen: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(subtask.title);
  const done = subtask.status === 'DONE';

  // The parent refetches after every patch — keep the draft in step with the server.
  useEffect(() => {
    setText(subtask.title);
  }, [subtask.title]);

  const commit = () => {
    const next = text.trim();
    if (next && next !== subtask.title) onPatch({ title: next });
    else setText(subtask.title);
    setEditing(false);
  };

  const cancel = () => {
    setText(subtask.title);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-800/40 dark:bg-[#222222]/50">
      <button
        type="button"
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        onClick={onToggle}
        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer ${
          done
            ? 'border-indigo-500 bg-indigo-500 text-white'
            : 'border-slate-300 hover:border-indigo-400 dark:border-slate-700'
        }`}
      >
        {done ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </button>

      {editing ? (
        <>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') cancel();
            }}
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-700 outline-none transition-all focus:border-indigo-500 dark:border-slate-700 dark:bg-[#252525] dark:text-white"
          />
          <button
            type="button"
            onClick={commit}
            disabled={!text.trim()}
            aria-label="Save subtask title"
            className="shrink-0 rounded-md p-1 text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-950/30 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancel editing"
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpen}
            className={`min-w-0 flex-1 truncate text-left text-sm font-medium cursor-pointer ${
              done
                ? 'text-slate-400 line-through dark:text-slate-500'
                : 'text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400'
            }`}
          >
            {subtask.title}
          </button>
          <AssigneePicker
            compact
            members={members}
            selected={subtask.assignees}
            onChange={(assigneeIds) => onPatch({ assigneeIds })}
          />
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Rename subtask"
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300 cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
            </svg>
          </button>
          <span className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500">{subtask.ref}</span>
        </>
      )}
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
