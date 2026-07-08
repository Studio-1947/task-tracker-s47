import { useEffect, useMemo, useState } from 'react';
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
import { useLabels } from '../hooks/useLabels';
import { useAuth } from '../stores/auth';
import { formatDate, isOverdue, priorityClasses, statusClasses, statusLabel } from '../lib/format';
import { ApiRequestError } from '../lib/api';
import { Badge, Button, Card, EmptyState, ErrorState, Input, LabelChip, Spinner } from '../components/ui';
import { TaskDrawer } from '../components/TaskDrawer';
import { KanbanView } from '../components/KanbanView';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { WorkspaceSettings } from '../components/WorkspaceSettings';

type View = 'list' | 'table' | 'kanban';

const DEFAULT_FILTERS: TaskFilters = { sort: 'createdAt', order: 'desc' };

export function WorkspaceTasksPage() {
  const { id = '' } = useParams();
  // Key by workspace id so filter state (persisted per workspace) resets cleanly
  // when navigating between boards.
  return <Board key={id} workspaceId={id} />;
}

function loadFilters(workspaceId: string): TaskFilters {
  try {
    const raw = localStorage.getItem(`tt.filters.${workspaceId}`);
    if (raw) return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as TaskFilters) };
  } catch {
    /* ignore malformed storage */
  }
  return DEFAULT_FILTERS;
}

function Board({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: labels } = useLabels(workspaceId);
  const [view, setView] = useState<View>('list');
  const [filters, setFilters] = useState<TaskFilters>(() => loadFilters(workspaceId));
  const [page, setPage] = useState(1);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { data, isLoading, error } = useTasks(workspaceId, { ...filters, page });

  // Persist filters per workspace (saved filters).
  useEffect(() => {
    localStorage.setItem(`tt.filters.${workspaceId}`, JSON.stringify(filters));
  }, [filters, workspaceId]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.assigneeId, filters.labelId, filters.search, filters.sort, filters.order]);

  const createTask = useCreateTask(workspaceId);
  const [newTitle, setNewTitle] = useState('');

  const memberRefs = useMemo(
    () => (members ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email })),
    [members],
  );

  const filtersActive =
    !!filters.search || !!filters.status || !!filters.assigneeId || !!filters.labelId;

  const pageSize = data?.pageSize ?? 50;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createTask.mutate({ title: newTitle }, { onSuccess: () => setNewTitle('') });
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/workspaces" className="text-sm text-slate-400 hover:text-slate-600">
            ← Workspaces
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-800">{workspace?.name ?? 'Tasks'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
            {(['list', 'table', 'kanban'] as const).map((v) => (
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
          {isAdmin ? (
            <Button variant="ghost" onClick={() => setShowSettings(true)}>
              Manage
            </Button>
          ) : null}
        </div>
      </div>

      {/* Create + filters */}
      <Card className="mt-6 p-4">
        <form className="flex flex-wrap items-center gap-3" onSubmit={onCreate}>
          <Input
            className="flex-1 min-w-[200px]"
            placeholder="Quick add — task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button type="submit" disabled={createTask.isPending}>
            {createTask.isPending ? 'Adding…' : 'Add'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowCreate(true)}>
            + Detailed task
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input
            className="w-full sm:w-56"
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
          <select
            aria-label="Filter by label"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            value={filters.labelId ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, labelId: e.target.value || undefined }))}
          >
            <option value="">All labels</option>
            {(labels ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {filtersActive ? (
            <Button variant="ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
              Reset filters
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="mt-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load tasks'} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={filtersActive ? 'No tasks match your filters' : 'No tasks yet'}
            hint={filtersActive ? 'Try clearing filters to see everything.' : 'Add your first task above.'}
            action={
              filtersActive ? (
                <Button variant="ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                  Reset filters
                </Button>
              ) : null
            }
          />
        ) : view === 'list' ? (
          <ListView tasks={data.items} onOpen={setOpenTaskId} />
        ) : view === 'table' ? (
          <TableView tasks={data.items} onOpen={setOpenTaskId} />
        ) : (
          <KanbanView workspaceId={workspaceId} tasks={data.items} onOpen={setOpenTaskId} />
        )}
        {data ? (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-400">{data.total} task(s)</p>
            {view !== 'kanban' && totalPages > 1 ? (
              <div className="flex items-center gap-2 text-sm">
                <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <span className="text-slate-500">
                  {page} / {totalPages}
                </span>
                <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {openTaskId ? (
        <TaskDrawer
          workspaceId={workspaceId}
          taskId={openTaskId}
          members={memberRefs}
          labels={labels ?? []}
          onClose={() => setOpenTaskId(null)}
        />
      ) : null}
      {showCreate ? (
        <CreateTaskModal
          workspaceId={workspaceId}
          members={memberRefs}
          labels={labels ?? []}
          onClose={() => setShowCreate(false)}
        />
      ) : null}
      {showSettings ? (
        <WorkspaceSettings workspaceId={workspaceId} onClose={() => setShowSettings(false)} />
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
          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left hover:border-indigo-300 hover:shadow-sm sm:gap-3 sm:px-4"
        >
          <span className="hidden w-16 shrink-0 font-mono text-xs text-slate-400 sm:inline">{t.ref}</span>
          <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{t.title}</span>
          {t.labels.slice(0, 2).map((l) => (
            <span key={l.id} className="hidden lg:inline">
              <LabelChip name={l.name} color={l.color} />
            </span>
          ))}
          {t.assignees[0] ? (
            <span className="hidden md:inline-flex">
              <Badge>{t.assignees[0].name}</Badge>
            </span>
          ) : null}
          <span
            className={`hidden text-xs sm:inline ${isOverdue(t.dueDate) ? 'font-medium text-red-600' : 'text-slate-400'}`}
          >
            {formatDate(t.dueDate)}
          </span>
          <span className="hidden sm:inline">
            <PriorityBadge t={t} />
          </span>
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
      <table className="w-full min-w-[640px] text-sm">
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
