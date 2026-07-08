import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { TASK_STATUSES, type TaskListItem } from '@task-tracker/shared';
import {
  useCreateTask,
  useTasks,
  useWorkspace,
  useWorkspaceMembers,
  type TaskFilters,
} from '../hooks/useTasks';
import { formatDate, isOverdue, priorityClasses, statusClasses, statusLabel } from '../lib/format';
import { ApiRequestError } from '../lib/api';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';
import { TaskDrawer } from '../components/TaskDrawer';

type View = 'list' | 'table';

export function WorkspaceTasksPage() {
  const { id = '' } = useParams();
  const { data: workspace } = useWorkspace(id);
  const { data: members } = useWorkspaceMembers(id);
  const [view, setView] = useState<View>('list');
  const [filters, setFilters] = useState<TaskFilters>({ sort: 'createdAt', order: 'desc' });
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { data, isLoading, error } = useTasks(id, filters);

  const createTask = useCreateTask(id);
  const [newTitle, setNewTitle] = useState('');

  const memberRefs = useMemo(() => (members ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email })), [members]);

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createTask.mutate({ title: newTitle }, { onSuccess: () => setNewTitle('') });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link to="/workspaces" className="text-sm text-slate-400 hover:text-slate-600">
            ← Workspaces
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-800">{workspace?.name ?? 'Tasks'}</h1>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {(['list', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm font-medium capitalize ${
                view === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Create + filters */}
      <Card className="mt-6 p-4">
        <form className="flex flex-wrap items-center gap-3" onSubmit={onCreate}>
          <Input
            className="flex-1 min-w-[220px]"
            placeholder="New task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button type="submit" disabled={createTask.isPending}>
            {createTask.isPending ? 'Adding…' : 'Add task'}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input
            className="w-56"
            placeholder="Search title/description…"
            value={filters.search ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <select
            aria-label="Filter by status"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
          >
            <option value="">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by assignee"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.assigneeId ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value || undefined }))}
          >
            <option value="">All assignees</option>
            {memberRefs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="mt-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load tasks'} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No tasks" hint="Add your first task above." />
        ) : view === 'list' ? (
          <ListView tasks={data.items} onOpen={setOpenTaskId} />
        ) : (
          <TableView tasks={data.items} onOpen={setOpenTaskId} />
        )}
        {data ? <p className="mt-3 text-xs text-slate-400">{data.total} task(s)</p> : null}
      </div>

      {openTaskId ? (
        <TaskDrawer
          workspaceId={id}
          taskId={openTaskId}
          members={memberRefs}
          onClose={() => setOpenTaskId(null)}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ t }: { t: TaskListItem }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses[t.status]}`}>{statusLabel(t.status)}</span>;
}
function PriorityBadge({ t }: { t: TaskListItem }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityClasses[t.priority]}`}>{t.priority}</span>;
}

function ListView({ tasks, onOpen }: { tasks: TaskListItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t.id)}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:shadow-sm"
        >
          <span className="w-16 shrink-0 font-mono text-xs text-slate-400">{t.ref}</span>
          <span className="flex-1 font-medium text-slate-700">{t.title}</span>
          {t.assignees[0] ? <Badge>{t.assignees[0].name}</Badge> : null}
          <span className={`text-xs ${isOverdue(t.dueDate) ? 'font-medium text-red-600' : 'text-slate-400'}`}>
            {formatDate(t.dueDate)}
          </span>
          <PriorityBadge t={t} />
          <StatusBadge t={t} />
        </button>
      ))}
    </div>
  );
}

const columnHelper = createColumnHelper<TaskListItem>();

function TableView({ tasks, onOpen }: { tasks: TaskListItem[]; onOpen: (id: string) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(
    () => [
      columnHelper.accessor('ref', { header: 'Ref', cell: (c) => <span className="font-mono text-xs text-slate-400">{c.getValue()}</span> }),
      columnHelper.accessor('title', { header: 'Title', cell: (c) => <span className="font-medium text-slate-700">{c.getValue()}</span> }),
      columnHelper.accessor('status', { header: 'Status', cell: (c) => <StatusBadge t={c.row.original} /> }),
      columnHelper.accessor('priority', { header: 'Priority', cell: (c) => <PriorityBadge t={c.row.original} /> }),
      columnHelper.accessor((r) => r.assignees[0]?.name ?? '', {
        id: 'assignee',
        header: 'Assignee',
        cell: (c) => <span className="text-sm text-slate-600">{c.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('dueDate', {
        header: 'Due',
        cell: (c) => (
          <span className={`text-sm ${isOverdue(c.getValue()) ? 'font-medium text-red-600' : 'text-slate-500'}`}>
            {formatDate(c.getValue())}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="cursor-pointer px-4 py-2 font-medium select-none" onClick={h.column.getToggleSortingHandler()}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: ' ↑', desc: ' ↓' }[h.column.getIsSorted() as string] ?? ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-100">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(row.original.id)}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2.5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
