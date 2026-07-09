import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
  // Deep-link support (?task=<id>) so search results and dashboard widgets can
  // open the drawer directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openTaskId, setOpenTaskId] = useState<string | null>(() => searchParams.get('task'));
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { data, isLoading, error } = useTasks(workspaceId, { ...filters, page });

  const paramTaskId = searchParams.get('task');
  useEffect(() => {
    if (paramTaskId) setOpenTaskId(paramTaskId);
  }, [paramTaskId]);

  const closeTask = () => {
    setOpenTaskId(null);
    if (searchParams.has('task')) {
      const next = new URLSearchParams(searchParams);
      next.delete('task');
      setSearchParams(next, { replace: true });
    }
  };

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
    () => (members ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email, avatarKey: m.avatarKey ?? null })),
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
    <>
      <div className="animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/workspaces" className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-650 dark:text-slate-500 dark:hover:text-slate-300 transition-colors flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Workspaces
            </Link>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{workspace?.name ?? 'Tasks'}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100/50 dark:bg-slate-900/50">
              {(['list', 'table', 'kanban'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-150 capitalize cursor-pointer ${
                    view === v
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {isAdmin ? (
              <Button variant="ghost" className="text-xs font-semibold py-2" onClick={() => void setShowSettings(true)}>
                Manage
              </Button>
            ) : null}
          </div>
        </div>

        {/* Create + filters */}
        <Card className="mt-6 p-5 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
          <form className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3" onSubmit={onCreate}>
            <Input
              className="flex-1"
              placeholder="Quick add — task title…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <div className="flex gap-2 shrink-0">
              <Button type="submit" className="flex-1 sm:flex-initial" disabled={createTask.isPending}>
                {createTask.isPending ? 'Adding…' : 'Add'}
              </Button>
              <Button type="button" className="flex-1 sm:flex-initial" variant="ghost" onClick={() => void setShowCreate(true)}>
                + Detailed task
              </Button>
            </div>
          </form>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:gap-3">
            <input
              className="w-full lg:w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-800 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all"
              placeholder="Search title/description…"
              value={filters.search ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
            <select
              aria-label="Filter by status"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-800 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all lg:w-auto"
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
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-800 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all lg:w-auto"
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
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-800 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all lg:w-auto"
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
              <Button variant="ghost" className="w-full lg:w-auto text-xs py-2 px-3" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
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
            <div className="mt-3.5 flex items-center justify-between px-1.5">
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">{data.total} task(s) found</p>
              {view !== 'kanban' && totalPages > 1 ? (
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Button variant="ghost" className="py-1 px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Prev
                  </Button>
                  <span className="text-slate-500 dark:text-slate-400 min-w-12 text-center">
                    {page} / {totalPages}
                  </span>
                  <Button variant="ghost" className="py-1 px-3" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {openTaskId ? (
        <TaskDrawer
          workspaceId={workspaceId}
          taskId={openTaskId}
          members={memberRefs}
          labels={labels ?? []}
          onClose={closeTask}
        />
      ) : null}
      {showCreate ? (
        <CreateTaskModal
          workspaceId={workspaceId}
          members={memberRefs}
          labels={labels ?? []}
          onClose={() => void setShowCreate(false)}
        />
      ) : null}
      {showSettings ? (
        <WorkspaceSettings workspaceId={workspaceId} onClose={() => void setShowSettings(false)} />
      ) : null}
    </>
  );
}

function StatusBadge({ t }: { t: TaskListItem }) {
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusClasses[t.status]}`}>{statusLabel(t.status)}</span>;
}
function PriorityBadge({ t }: { t: TaskListItem }) {
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${priorityClasses[t.priority]}`}>{t.priority}</span>;
}

function ListView({ tasks, onOpen }: { tasks: TaskListItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-2.5">
      {tasks.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t.id)}
          className="w-full rounded-xl border border-slate-100 bg-white/70 dark:border-slate-800/40 dark:bg-slate-900/30 p-3.5 text-left hover:border-indigo-500 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/[0.01] hover:-translate-y-0.5 transition-all duration-150 sm:flex sm:items-center sm:gap-4 sm:px-5"
        >
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4 sm:flex-1 min-w-0">
            {/* Primary Row: Ref, Title, Mobile Status */}
            <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0 sm:flex-1">
              <span className="font-mono text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded w-16 text-center shrink-0">{t.ref}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-750 dark:text-slate-200">{t.title}</span>
              <span className="sm:hidden shrink-0">
                <StatusBadge t={t} />
              </span>
            </div>

            {/* Metadata Row: labels, assignee, due date, priority, status */}
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0 sm:gap-4">
              {t.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1 sm:hidden lg:flex">
                  {t.labels.slice(0, 2).map((l) => (
                    <LabelChip key={l.id} name={l.name} color={l.color} />
                  ))}
                </div>
              ) : null}
              {t.assignees[0] ? (
                <span className="sm:hidden md:inline-flex">
                  <Badge>{t.assignees[0].name}</Badge>
                </span>
              ) : null}
              {t.dueDate ? (
                <span
                  className={`text-xs font-semibold ${isOverdue(t.dueDate) ? 'text-red-500 dark:text-red-400' : 'text-slate-450 dark:text-slate-500'}`}
                >
                  {formatDate(t.dueDate)}
                </span>
              ) : null}
              <PriorityBadge t={t} />
              <span className="hidden sm:inline">
                <StatusBadge t={t} />
              </span>
            </div>
          </div>
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
      columnHelper.accessor('ref', { header: 'Ref', cell: (c) => <span className="font-mono text-xs text-slate-450 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{c.getValue()}</span> }),
      columnHelper.accessor('title', { header: 'Title', cell: (c) => <span className="font-semibold text-slate-750 dark:text-slate-200">{c.getValue()}</span> }),
      columnHelper.accessor('status', { header: 'Status', cell: (c) => <StatusBadge t={c.row.original} /> }),
      columnHelper.accessor('priority', { header: 'Priority', cell: (c) => <PriorityBadge t={c.row.original} /> }),
      columnHelper.accessor((r) => r.assignees[0]?.name ?? '', {
        id: 'assignee',
        header: 'Assignee',
        cell: (c) => <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{c.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('dueDate', {
        header: 'Due',
        cell: (c) => (
          <span className={`text-sm font-semibold ${isOverdue(c.getValue()) ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
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
    <Card className="overflow-hidden bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50/80 dark:bg-slate-900/30 text-left text-[11px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="cursor-pointer px-4 py-3 font-semibold select-none" onClick={h.column.getToggleSortingHandler()}>
                    <span className="flex items-center gap-1.5">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: ' ↑', desc: ' ↓' }[h.column.getIsSorted() as string] ?? ''}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors" onClick={() => onOpen(row.original.id)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
