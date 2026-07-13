import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TASK_STATUSES, type TaskListItem, type TaskStatus } from '@task-tracker/shared';
import { useUpdateTask } from '../hooks/useTasks';
import { formatDate, isOverdue, priorityClasses, statusClasses, statusLabel } from '../lib/format';
import { LabelChip } from './ui';
import { DueDateProgress } from './DueDateProgress';

interface Props {
  workspaceId: string;
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
  showProject?: boolean;
}

export function KanbanView({ workspaceId, tasks, onOpen, showProject }: Props) {
  const update = useUpdateTask(workspaceId);
  const [activeId, setActiveId] = useState<string | null>(null);
  // A small drag threshold so taps still register as clicks (open drawer) and the
  // column strip stays scrollable on touch devices.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStatus = useMemo(() => {
    const map: Record<string, TaskListItem[]> = {};
    for (const s of TASK_STATUSES) map[s] = [];
    for (const t of tasks) (map[t.status] ??= []).push(t);
    return map;
  }, [tasks]);

  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) {
      update.mutate({ id: taskId, patch: { status: newStatus } });
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={byStatus[status] ?? []}
            onOpen={onOpen}
            showProject={showProject}
            workspaceId={workspaceId}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <Card task={activeTask} overlay showProject={showProject} workspaceId={workspaceId} /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  onOpen,
  showProject,
  workspaceId,
}: {
  status: TaskStatus;
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
  showProject?: boolean;
  workspaceId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-3 flex items-center justify-between px-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses[status]}`}>
          {statusLabel(status)}
        </span>
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-[#252525] px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-3 rounded-2xl border p-3 transition ${
          isOver ? 'border-indigo-400 bg-indigo-50/20 dark:border-indigo-500/50 dark:bg-indigo-950/10' : 'border-slate-100 dark:border-[#2d2d2d] bg-slate-50/40 dark:bg-[#181818]/20'
        }`}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} showProject={showProject} workspaceId={workspaceId} />
        ))}
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-xs font-semibold uppercase tracking-wider text-slate-350 dark:text-slate-600 border border-dashed border-slate-200/60 dark:border-[#2d2d2d] rounded-xl bg-white/30 dark:bg-[#1a1a1a]/10">Drop target</div>
        ) : null}
      </div>
    </div>
  );
}

function DraggableCard({
  task,
  onOpen,
  showProject,
  workspaceId,
}: {
  task: TaskListItem;
  onOpen: (id: string) => void;
  showProject?: boolean;
  workspaceId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      className="cursor-grab touch-none rounded-xl border border-slate-150/60 dark:border-[#2d2d2d] bg-white dark:bg-[#1e1e1e] p-4 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.02)] active:cursor-grabbing hover:border-indigo-400 dark:hover:border-indigo-500/40 transition duration-150"
    >
      <Card task={task} showProject={showProject} workspaceId={workspaceId} />
    </div>
  );
}

function Card({ task, overlay = false, showProject, workspaceId }: { task: TaskListItem; overlay?: boolean; showProject?: boolean; workspaceId: string }) {
  return (
    <div className={overlay ? 'w-64 rounded-xl border border-indigo-400 bg-white dark:bg-[#1e1e1e] p-4 shadow-xl dark:shadow-none' : ''}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-[#252525] px-1.5 py-0.5 rounded">{task.ref}</span>
          {showProject ? (
            <span className="truncate rounded bg-slate-100 dark:bg-[#252525] px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:text-slate-400">{task.projectName}</span>
          ) : null}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${priorityClasses[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      <p className="mt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug break-words">{task.title}</p>
      {task.subtaskCount > 0 ? (
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-[#252525] px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          {task.subtaskDoneCount}/{task.subtaskCount} subtasks
        </span>
      ) : null}
      {task.labels.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} />
          ))}
        </div>
      ) : null}
      <div className="mt-3.5 flex items-center justify-between text-[11px] font-semibold">
        <span className="truncate text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {task.assignees[0]?.name ?? 'Unassigned'}
        </span>
        {task.dueDate ? (
          <span className={isOverdue(task.dueDate) ? 'text-red-500 dark:text-red-400 font-bold' : 'text-slate-400 dark:text-slate-500'}>
            {formatDate(task.dueDate)}
          </span>
        ) : null}
      </div>
      <DueDateProgress t={task} workspaceId={workspaceId} />
    </div>
  );
}
