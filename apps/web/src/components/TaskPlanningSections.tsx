import { useState } from 'react';
import { TASK_SIZE_LABELS, taskSizeLabel, type TaskDetail } from '@task-tracker/shared';
import {
  useAllocateTimeEntry,
  useReviseEstimate,
  useAddTaskDependency,
  useRemoveTaskDependency,
  useReopenTask,
  useTaskDependencies,
  useTasks,
} from '../hooks/useTasks';
import { ApiRequestError } from '../lib/api';
import { statusClasses, statusLabel } from '../lib/format';
import type { EstimateClassification } from '../hooks/useTasks';
import { Button } from './ui';

const fieldCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500';
const h3Cls = 'text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400';
const linkBtn = 'text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400';
const errText = (e: unknown, fallback: string) => (e instanceof ApiRequestError ? e.message : fallback);

/** Size is derived from minutes (spec §4): show the original label and, if the approved estimate moved it, the current one. */
export function SizeChip({ baseline, current }: { baseline: number | null; current: number | null }) {
  const original = taskSizeLabel(baseline);
  const now = taskSizeLabel(current ?? baseline);
  if (!now) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800">
        No estimate
      </span>
    );
  }
  const moved = original && original !== now;
  return (
    <span
      title={moved ? `Originally ${TASK_SIZE_LABELS[original]}` : undefined}
      className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
    >
      {TASK_SIZE_LABELS[now]}
      {moved ? ` (was ${TASK_SIZE_LABELS[original]})` : ''}
    </span>
  );
}

/** Larger than 120 minutes and not yet split: prompt to break the work up (spec section 3). */
export function BreakupPrompt({ task }: { task: TaskDetail }) {
  const minutes = task.currentEstimateMinutes ?? task.baselineEstimateMinutes ?? 0;
  if (task.parentTaskId || task.subtasks.length > 0 || minutes <= 120) return null;
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
      This is {minutes} minutes of work. Consider splitting it into subtasks by outcome or handoff, each with its own
      completion condition, or note why it should stay whole.
    </p>
  );
}

export function AcceptanceCriteriaSection({
  task,
  onSave,
  onScopeChange,
}: {
  task: TaskDetail;
  onSave: (v: string | null) => void;
  onScopeChange: (scope: 'REQUIRED' | 'OPTIONAL' | 'CANCELLED') => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = task.acceptanceCriteria ?? '';
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className={h3Cls}>Acceptance criteria</h3>
        {draft === null ? (
          <button type="button" className={linkBtn} onClick={() => setDraft(text)}>
            {text ? 'Edit' : 'Add'}
          </button>
        ) : null}
      </div>
      {draft !== null ? (
        <div className="space-y-2">
          <textarea
            aria-label="Acceptance criteria"
            autoFocus
            rows={3}
            className={fieldCls}
            placeholder="How will the reviewer decide this is complete? e.g. Three layout options submitted as a PDF."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" className="px-3 py-1.5 text-xs" onClick={() => { onSave(draft.trim() || null); setDraft(null); }}>
              Save
            </Button>
            <Button type="button" variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : text ? (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{text}</p>
      ) : (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          No completion condition yet, so a reviewer cannot tell when this is done.
        </p>
      )}
      {task.parentTaskId ? (
        <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Scope of the parent deliverable
          <select
            aria-label="Child scope"
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-800 dark:bg-[#252525]"
            value={task.childScope}
            onChange={(e) => onScopeChange(e.target.value as 'REQUIRED' | 'OPTIONAL' | 'CANCELLED')}
          >
            <option value="REQUIRED">Required</option>
            <option value="OPTIONAL">Optional</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      ) : null}
    </section>
  );
}

export function DependenciesSection({ task, workspaceId }: { task: TaskDetail; workspaceId: string }) {
  const { data: deps = [], isLoading } = useTaskDependencies(task.id);
  const add = useAddTaskDependency(task.id);
  const remove = useRemoveTaskDependency(task.id);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'WAITS_ON' | 'BLOCKS'>('WAITS_ON');
  const [isBlocking, setIsBlocking] = useState(true);
  const { data: results } = useTasks(workspaceId, { search, pageSize: 8 });
  const linked = new Set(deps.map((d) => d.task.id));
  const candidates = (results?.items ?? []).filter((t) => t.id !== task.id && !linked.has(t.id));
  const unfinished = deps.filter((d) => d.direction === 'WAITS_ON' && d.isBlocking && d.task.status !== 'DONE');

  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <h3 className={h3Cls}>Dependencies</h3>
        <button type="button" className={linkBtn} onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Add dependency'}
        </button>
      </div>
      {unfinished.length ? (
        <p role="status" className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
          Waiting on {unfinished.length} unfinished {unfinished.length === 1 ? 'predecessor' : 'predecessors'} before this can finish.
        </p>
      ) : null}
      {isLoading ? <p className="mt-2 text-xs text-slate-400">Loading…</p> : null}
      {!isLoading && deps.length === 0 ? <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No dependencies.</p> : null}
      <ul className="mt-2 space-y-1.5">
        {deps.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-850">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {d.direction === 'WAITS_ON' ? 'Waits on' : 'Blocks'}
            </span>
            <span className="font-mono text-xs font-bold text-slate-500">{d.task.ref}</span>
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{d.task.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses[d.task.status as keyof typeof statusClasses] ?? ''}`}>
              {statusLabel(d.task.status as never)}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">{d.isBlocking ? 'blocks finishing' : 'advisory'}</span>
            <button
              type="button"
              aria-label={`Remove dependency on ${d.task.ref}`}
              className="text-xs font-semibold text-red-600 hover:underline"
              disabled={remove.isPending}
              onClick={() => remove.mutate(d.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select aria-label="Dependency direction" className={fieldCls} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="WAITS_ON">This task waits on…</option>
              <option value="BLOCKS">This task blocks…</option>
            </select>
            <select aria-label="Dependency strength" className={fieldCls} value={isBlocking ? 'yes' : 'no'} onChange={(e) => setIsBlocking(e.target.value === 'yes')}>
              <option value="yes">Prevents finishing</option>
              <option value="no">Advisory only</option>
            </select>
          </div>
          <input aria-label="Search tasks" className={fieldCls} placeholder="Search tasks in this workspace…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="max-h-44 space-y-1 overflow-y-auto">
            {candidates.length === 0 ? <li className="text-xs text-slate-400">No matching tasks.</li> : null}
            {candidates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={add.isPending}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() =>
                    add.mutate(
                      direction === 'WAITS_ON'
                        ? { predecessorTaskId: t.id, successorTaskId: task.id, isBlocking }
                        : { predecessorTaskId: task.id, successorTaskId: t.id, isBlocking },
                      { onSuccess: () => setOpen(false) },
                    )
                  }
                >
                  <span className="font-mono text-xs font-bold text-slate-500">{t.ref}</span>
                  <span className="truncate">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {add.error ? <p className="text-sm text-red-600">{errText(add.error, 'Could not add dependency')}</p> : null}
        </div>
      ) : null}
      {remove.error ? <p className="mt-2 text-sm text-red-600">{errText(remove.error, 'Could not remove dependency')}</p> : null}
    </section>
  );
}

/** Accepted tasks can be reopened by the reviewer or a manager, with a retained reason (spec section 5). */
export function ReopenSection({ task, workspaceId, canReopen }: { task: TaskDetail; workspaceId: string; canReopen: boolean }) {
  const reopen = useReopenTask(task.id, workspaceId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (task.status !== 'DONE' || !canReopen) return null;
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <h3 className={h3Cls}>Reopen accepted work</h3>
        <button type="button" className={linkBtn} onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancel' : 'Reopen'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Past decisions are kept; the reason is recorded with your name and the time.</p>
      {open ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            reopen.mutate(reason.trim(), { onSuccess: () => { setOpen(false); setReason(''); } });
          }}
        >
          <textarea aria-label="Reason for reopening" required rows={2} className={fieldCls} placeholder="Why is this being reopened?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" variant="danger" disabled={!reason.trim() || reopen.isPending}>
            Reopen task
          </Button>
          {reopen.error ? <p className="text-sm text-red-600">{errText(reopen.error, 'Could not reopen')}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

/** Compact planning-hygiene chips for list rows: forecast beside the deadline, and what is missing (spec section 11). */
export function PlanningFlags({ task }: { task: import('@task-tracker/shared').TaskListItem }) {
  if (task.status === 'DONE') return null;
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
  const chip = 'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold';
  const forecast = task.actualEffortMinutes + (task.remainingEstimateMinutes ?? 0);
  const over = task.baselineEstimateMinutes !== null ? forecast - task.baselineEstimateMinutes : 0;
  return (
    <>
      {task.remainingEstimateMinutes !== null ? (
        <span
          className={`${chip} ${over > 0 ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300'}`}
          title={`Recorded ${fmt(task.actualEffortMinutes)} + remaining ${fmt(task.remainingEstimateMinutes)} = forecast ${fmt(forecast)}${task.baselineEstimateMinutes !== null ? ` against an original ${fmt(task.baselineEstimateMinutes)}` : ''}`}
        >
          Forecast {fmt(forecast)}
          {over > 0 ? ` (+${fmt(over)})` : ''}
        </span>
      ) : task.baselineEstimateMinutes === null ? (
        <span className={`${chip} bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}>No estimate</span>
      ) : null}
      {!task.owner ? <span className={`${chip} bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300`}>No owner</span> : null}
      {!task.dueDate ? <span className={`${chip} bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}>No deadline</span> : null}
    </>
  );
}

const REVISION_KINDS: Array<{ value: EstimateClassification; label: string; hint: string }> = [
  { value: 'CLIENT_CHANGE', label: 'Client change or added scope', hint: 'Recorded as scope change, not an execution error.' },
  { value: 'SCOPE_CHANGE', label: 'Approved scope increase', hint: 'Adds approved effort; the original baseline is kept.' },
  { value: 'INTERNAL_CHANGE', label: 'Internal preference change', hint: 'Recorded separately from an execution error.' },
  { value: 'PLANNING_CORRECTION', label: 'Unclear or incomplete brief', hint: 'Counted as a planning issue.' },
];

/** The approved estimate is never edited silently: a revision records who, why and what kind of change (spec sections 5 and 6). */
export function EstimateRevisionForm({ task, workspaceId }: { task: TaskDetail; workspaceId: string }) {
  const revise = useReviseEstimate(task.id, workspaceId);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [kind, setKind] = useState<EstimateClassification>('CLIENT_CHANGE');
  const [reason, setReason] = useState('');
  const hasChildren = task.subtasks.length > 0;
  if (hasChildren) {
    return <p className="mt-3 text-xs text-slate-500">The estimate rolls up from subtasks; revise it on the subtask that changed.</p>;
  }
  const next = Number(minutes);
  const valid = minutes !== '' && Number.isInteger(next) && next >= 0 && reason.trim().length > 0;
  const current = task.currentEstimateMinutes ?? 0;
  return (
    <div className="mt-3">
      {!open ? (
        <button type="button" className={linkBtn} onClick={() => { setOpen(true); setMinutes(String(current)); }}>Revise approved estimate</button>
      ) : (
        <form
          className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-850"
          onSubmit={(e) => {
            e.preventDefault();
            revise.mutate({ revisedEstimateMinutes: next, reason: reason.trim(), classification: kind }, { onSuccess: () => { setOpen(false); setReason(''); } });
          }}
        >
          <label className="block text-xs font-semibold text-slate-500">
            New approved estimate (minutes)
            <input aria-label="Revised estimate in minutes" type="number" min="0" className={`${fieldCls} mt-1`} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          {minutes !== '' && Number.isInteger(next) ? (
            <p className="text-xs text-slate-500">
              {next === current ? 'No change.' : `${next > current ? '+' : ''}${next - current} min against the current ${current}.`}
              {task.baselineEstimateMinutes !== null ? ` Original baseline stays ${task.baselineEstimateMinutes} min.` : ''}
            </p>
          ) : null}
          <label className="block text-xs font-semibold text-slate-500">
            Why is it changing?
            <select aria-label="Kind of change" className={`${fieldCls} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as EstimateClassification)}>
              {REVISION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-slate-400">{REVISION_KINDS.find((k) => k.value === kind)?.hint}</p>
          <textarea aria-label="Reason for estimate revision" rows={2} className={fieldCls} placeholder="What changed, and who approved it?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" className="px-3 py-1.5 text-xs" disabled={!valid || revise.isPending}>Record revision</Button>
            <Button type="button" variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {revise.error ? <p className="text-sm text-red-600">{errText(revise.error, 'Could not record the revision')}</p> : null}
        </form>
      )}
    </div>
  );
}

/** Move part of a logged entry from a parent onto a subtask so the minutes still appear exactly once (spec section 3, AT20). */
export function MoveTimeEntry({
  taskId,
  workspaceId,
  entryId,
  entryMinutes,
  subtasks,
}: {
  taskId: string;
  workspaceId: string;
  entryId: string;
  entryMinutes: number;
  subtasks: Array<{ id: string; ref: string; title: string }>;
}) {
  const allocate = useAllocateTimeEntry(taskId, workspaceId);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [minutes, setMinutes] = useState(String(entryMinutes));
  const [reason, setReason] = useState('');
  if (subtasks.length === 0 || entryMinutes < 1) return null;
  const n = Number(minutes);
  const valid = !!target && Number.isInteger(n) && n >= 1 && n <= entryMinutes && reason.trim().length > 0;
  return (
    <div className="mt-1">
      {!open ? (
        <button type="button" className={linkBtn} onClick={() => setOpen(true)}>Move to a subtask</button>
      ) : (
        <form
          className="space-y-1.5 rounded-lg bg-white p-2 dark:bg-[#202020]"
          onSubmit={(e) => {
            e.preventDefault();
            allocate.mutate({ entryId, targetTaskId: target, durationMinutes: n, reason: reason.trim() }, { onSuccess: () => setOpen(false) });
          }}
        >
          <select aria-label="Subtask to move time to" className={fieldCls} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose a subtask…</option>
            {subtasks.map((t) => <option key={t.id} value={t.id}>{t.ref} {t.title}</option>)}
          </select>
          <input aria-label="Minutes to move" type="number" min="1" max={entryMinutes} className={fieldCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <input aria-label="Reason for moving time" className={fieldCls} placeholder="Reason (audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" className="px-3 py-1 text-xs" disabled={!valid || allocate.isPending}>Move minutes</Button>
            <Button type="button" variant="ghost" className="px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {allocate.error ? <p className="text-xs text-red-600">{errText(allocate.error, 'Could not move the time')}</p> : null}
        </form>
      )}
    </div>
  );
}
