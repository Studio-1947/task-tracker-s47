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
import { useProjects } from '../hooks/useProjects';
import { useAuth } from '../stores/auth';
import { formatDate, isOverdue, priorityClasses, statusClasses, statusLabel } from '../lib/format';
import { ApiRequestError } from '../lib/api';
import { Button, Card, EmptyState, ErrorState, Input, LabelChip, Spinner } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { TaskDrawer } from '../components/TaskDrawer';
import { KanbanView } from '../components/KanbanView';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { WorkspaceSettings } from '../components/WorkspaceSettings';

type View = 'list' | 'table' | 'kanban';

const DEFAULT_FILTERS: TaskFilters = { sort: 'createdAt', order: 'desc', pageSize: 15 };

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
  const { data: projects } = useProjects(workspaceId);
  const [view, setView] = useState<View>('list');
  const [filters, setFilters] = useState<TaskFilters>(() => loadFilters(workspaceId));
  const [page, setPage] = useState(1);
  // Deep-link support (?task=<id>) so search results and dashboard widgets can
  // open the drawer directly. ?project=<id> scopes the board to one project.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openTaskId, setOpenTaskId] = useState<string | null>(() => searchParams.get('task'));
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Project scope is navigational (?project=), not a persisted filter.
  const selectedProjectId = searchParams.get('project') ?? '';
  const activeProjects = useMemo(() => (projects ?? []).filter((p) => !p.isArchived), [projects]);
  const selectProject = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('project', id);
    else next.delete('project');
    setSearchParams(next, { replace: true });
    setPage(1);
  };
  // Target project for quick-add: the selected one, else the first project.
  const [quickProjectId, setQuickProjectId] = useState('');
  const targetProjectId = selectedProjectId || quickProjectId || activeProjects[0]?.id || '';

  const { data, isLoading, error } = useTasks(workspaceId, {
    ...filters,
    projectId: selectedProjectId || undefined,
    page,
  });

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
  }, [filters.status, filters.assigneeId, filters.labelId, filters.search, filters.sort, filters.order, filters.pageSize]);

  const createTask = useCreateTask(workspaceId);
  const [newTitle, setNewTitle] = useState('');

  const memberRefs = useMemo(
    () => (members ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email, avatarKey: m.avatarKey ?? null })),
    [members],
  );

  const filtersActive =
    !!filters.search || !!filters.status || !!filters.assigneeId || !!filters.labelId;

  const pageSize = data?.pageSize ?? 15;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !targetProjectId) return;
    createTask.mutate(
      { projectId: targetProjectId, title: newTitle },
      { onSuccess: () => setNewTitle('') },
    );
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

        {/* Project scope selector */}
        <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <ProjectPill active={!selectedProjectId} onClick={() => selectProject('')} label="All projects" />
          {activeProjects.map((p) => (
            <ProjectPill
              key={p.id}
              active={selectedProjectId === p.id}
              onClick={() => selectProject(p.id)}
              label={p.name}
              prefix={p.taskPrefix}
              count={p.taskCount}
            />
          ))}
          <button
            type="button"
            onClick={() => setShowCreateProject(true)}
            className="shrink-0 rounded-full border border-dashed border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            + New project
          </button>
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
            {!selectedProjectId && activeProjects.length > 0 ? (
              <select
                aria-label="Project for new task"
                className="w-full sm:w-40 shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-800 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all"
                value={targetProjectId}
                onChange={(e) => setQuickProjectId(e.target.value)}
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex gap-2 shrink-0">
              <Button type="submit" className="flex-1 sm:flex-initial" disabled={createTask.isPending || !targetProjectId}>
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
            <ListView tasks={data.items} onOpen={setOpenTaskId} showProject={!selectedProjectId} />
          ) : view === 'table' ? (
            <TableView tasks={data.items} onOpen={setOpenTaskId} showProject={!selectedProjectId} />
          ) : (
            <KanbanView
              workspaceId={workspaceId}
              tasks={data.items}
              onOpen={setOpenTaskId}
              showProject={!selectedProjectId}
            />
          )}
          {data ? (
            <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-1.5">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-400 dark:text-slate-500">
                <span>{data.total} task(s) found</span>
                <span className="hidden sm:inline text-slate-200 dark:text-slate-800">|</span>
                <div className="flex items-center gap-1.5">
                  <span>Show</span>
                  <select
                    aria-label="Tasks per page"
                    value={filters.pageSize ?? 15}
                    onChange={(e) => setFilters((f) => ({ ...f, pageSize: Number(e.target.value) }))}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] py-1 px-1.5 outline-none text-[11px] font-semibold text-slate-700 dark:text-slate-350 cursor-pointer focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all"
                  >
                    <option value={10}>10 per page</option>
                    <option value={15}>15 per page</option>
                    <option value={30}>30 per page</option>
                    <option value={50}>50 per page</option>
                  </select>
                </div>
              </div>
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
          projects={activeProjects}
          defaultProjectId={selectedProjectId || undefined}
          onClose={() => void setShowCreate(false)}
        />
      ) : null}
      {showCreateProject ? (
        <CreateProjectModal
          workspaceId={workspaceId}
          onClose={() => void setShowCreateProject(false)}
          onCreated={(p) => selectProject(p.id)}
        />
      ) : null}
      {showSettings ? (
        <WorkspaceSettings workspaceId={workspaceId} onClose={() => void setShowSettings(false)} />
      ) : null}
    </>
  );
}

function ProjectPill({
  active,
  onClick,
  label,
  prefix,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  prefix?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
        active
          ? 'border-indigo-500 bg-indigo-50/70 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-950/30 dark:text-indigo-300'
          : 'border-slate-200 bg-white/60 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <span className="truncate max-w-[10rem]">{label}</span>
      {prefix ? <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{prefix}</span> : null}
      {count !== undefined ? (
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 text-[10px] text-slate-500 dark:text-slate-400">{count}</span>
      ) : null}
    </button>
  );
}

function StatusBadge({ t }: { t: TaskListItem }) {
  const icon = {
    TODO: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
    IN_PROGRESS: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
        <path d="M21 12a9 9 0 1 1-9-9" />
      </svg>
    ),
    IN_REVIEW: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    DONE: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="shrink-0">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  }[t.status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusClasses[t.status]}`}>
      {icon}
      {statusLabel(t.status)}
    </span>
  );
}

function PriorityBadge({ t }: { t: TaskListItem }) {
  const icon = {
    LOW: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
        <path d="M12 5v14M19 12l-7 7-7-7" />
      </svg>
    ),
    MEDIUM: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
        <path d="M5 12h14" />
      </svg>
    ),
    HIGH: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    ),
    URGENT: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
        <path d="m18 17-6-6-6 6M18 12l-6-6-6 6" />
      </svg>
    ),
  }[t.priority];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${priorityClasses[t.priority]}`}>
      {icon}
      {t.priority}
    </span>
  );
}

function ProjectTag({ name }: { name: string }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      {name}
    </span>
  );
}

function ListView({
  tasks,
  onOpen,
  showProject,
}: {
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
  showProject?: boolean;
}) {
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

            {/* Metadata Row: project, labels, assignee, due date, priority, status */}
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0 sm:gap-4">
              {showProject ? <ProjectTag name={t.projectName} /> : null}
              {t.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1 sm:hidden lg:flex">
                  {t.labels.slice(0, 2).map((l) => (
                    <LabelChip key={l.id} name={l.name} color={l.color} />
                  ))}
                </div>
              ) : null}
              {t.assignees[0] ? (
                <span className="sm:hidden md:inline-flex items-center gap-1.5 rounded-full bg-slate-100/60 dark:bg-slate-800/40 px-2 py-0.5 text-[10px] font-semibold text-slate-650 dark:text-slate-350 border border-slate-200/30 dark:border-slate-700/50 shadow-xs">
                  <Avatar user={t.assignees[0]} size="sm" className="!h-4.5 !w-4.5 !text-[8px]" />
                  <span>{t.assignees[0].name}</span>
                </span>
              ) : null}
              {t.dueDate ? (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isOverdue(t.dueDate) ? 'text-red-500 dark:text-red-400' : 'text-slate-450 dark:text-slate-500'}`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
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

function TableView({
  tasks,
  onOpen,
  showProject,
}: {
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
  showProject?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(
    () => [
      columnHelper.accessor('ref', { header: 'Ref', cell: (c) => <span className="font-mono text-xs text-slate-450 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{c.getValue()}</span> }),
      columnHelper.accessor('title', { header: 'Title', cell: (c) => <span className="font-semibold text-slate-750 dark:text-slate-200">{c.getValue()}</span> }),
      ...(showProject
        ? [
            columnHelper.accessor('projectName', {
              header: 'Project',
              cell: (c) => <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{c.getValue()}</span>,
            }),
          ]
        : []),
      columnHelper.accessor('status', { header: 'Status', cell: (c) => <StatusBadge t={c.row.original} /> }),
      columnHelper.accessor('priority', { header: 'Priority', cell: (c) => <PriorityBadge t={c.row.original} /> }),
      columnHelper.accessor((r) => r.assignees[0], {
        id: 'assignee',
        header: 'Assignee',
        cell: (c) => {
          const val = c.getValue();
          if (!val) return <span className="text-slate-455 dark:text-slate-600 font-medium">—</span>;
          return (
            <span className="inline-flex items-center gap-2 font-semibold text-slate-650 dark:text-slate-350">
              <Avatar user={val} size="sm" className="!h-5 !w-5 !text-[9px]" />
              <span>{val.name}</span>
            </span>
          );
        },
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
    [showProject],
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
