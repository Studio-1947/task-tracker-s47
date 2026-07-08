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

interface Props {
  workspaceId: string;
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
}

export function KanbanView({ workspaceId, tasks, onOpen }: Props) {
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
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_STATUSES.map((status) => (
          <Column key={status} status={status} tasks={byStatus[status] ?? []} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay>{activeTask ? <Card task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  onOpen,
}: {
  status: TaskStatus;
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClasses[status]}`}>
          {statusLabel(status)}
        </span>
        <span className="text-xs text-slate-400">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 rounded-lg border p-2 transition ${
          isOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} />
        ))}
        {tasks.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-300">Drop here</div>
        ) : null}
      </div>
    </div>
  );
}

function DraggableCard({ task, onOpen }: { task: TaskListItem; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      className="cursor-grab touch-none rounded-md border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <Card task={task} />
    </div>
  );
}

function Card({ task, overlay = false }: { task: TaskListItem; overlay?: boolean }) {
  return (
    <div className={overlay ? 'w-64 rounded-md border border-indigo-300 bg-white p-3 shadow-lg' : ''}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-slate-400">{task.ref}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClasses[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-700">{task.title}</p>
      {task.labels.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} />
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="truncate text-slate-500">{task.assignees[0]?.name ?? 'Unassigned'}</span>
        {task.dueDate ? (
          <span className={isOverdue(task.dueDate) ? 'font-medium text-red-600' : 'text-slate-400'}>
            {formatDate(task.dueDate)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
