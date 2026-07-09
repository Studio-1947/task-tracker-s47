import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError, setAccessToken } from '../../lib/api';
import { sdApi } from '../../lib/superdevApi';
import { useSuperDev } from '../../stores/superdev';
import { useAuth } from '../../stores/auth';

// ---- Types (kept local to the console) ----------------------------------

interface Overview {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  uptimeSeconds: number;
  nodeVersion: string;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  counts: {
    users: number;
    activeUsers: number;
    admins: number;
    workspaces: number;
    projects: number;
    tasks: number;
    activeSessions: number;
  };
  errors: { last24h: number; unresolved: number };
  generatedAt: string;
}
interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
interface ActivityItem {
  id: string;
  action: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
  workspace: { id: string; name: string } | null;
  taskRef: string | null;
  taskTitle: string | null;
}
interface ErrorRow {
  id: string;
  level: string;
  statusCode: number | null;
  method: string | null;
  path: string | null;
  message: string;
  stack: string | null;
  userId: string | null;
  resolved: boolean;
  createdAt: string;
}
interface SdUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  designation: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  tokenVersion: number;
  createdAt: string;
  sessionCount: number;
}
interface SdWorkspace {
  id: string;
  name: string;
  isArchived: boolean;
  createdAt: string;
  memberCount: number;
  projectCount: number;
  taskCount: number;
}
interface Flag {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

const TABS = ['Overview', 'Activity', 'Errors', 'Users', 'Workspaces', 'Kill-switches'] as const;
type Tab = (typeof TABS)[number];

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
function errMsg(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Request failed';
}

// =========================================================================

export function SuperDevConsole() {
  const email = useSuperDev((s) => s.email);
  const logout = useSuperDev((s) => s.logout);
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-slate-200">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#0a0a0b]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 font-mono text-xs font-bold text-emerald-400">
            $_
          </span>
          <span className="font-mono text-sm font-semibold tracking-wider text-slate-300">root console</span>
          <span className="ml-auto hidden font-mono text-xs text-slate-500 sm:inline">{email}</span>
          <button
            onClick={() => void logout()}
            className="rounded-md border border-white/10 px-3 py-1 font-mono text-xs text-slate-400 transition hover:border-red-500/40 hover:text-red-400"
          >
            exit
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2 sm:px-5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 font-mono text-xs transition ${
                tab === t
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {tab === 'Overview' && <OverviewTab />}
        {tab === 'Activity' && <ActivityTab />}
        {tab === 'Errors' && <ErrorsTab />}
        {tab === 'Users' && <UsersTab />}
        {tab === 'Workspaces' && <WorkspacesTab />}
        {tab === 'Kill-switches' && <FlagsTab />}
      </main>
    </div>
  );
}

// ---- shared bits --------------------------------------------------------

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/5 bg-[#111113] ${className}`}>{children}</div>
  );
}
function Loading() {
  return <p className="py-10 text-center font-mono text-xs text-slate-500">loading…</p>;
}
function Failed({ error }: { error: unknown }) {
  return (
    <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-400">
      {errMsg(error)}
    </p>
  );
}
function Stat({ label, value, tone = 'slate' }: { label: string; value: React.ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' }) {
  const color = {
    slate: 'text-slate-100',
    green: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
  }[tone];
  return (
    <Panel className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</p>
    </Panel>
  );
}

// ---- Overview -----------------------------------------------------------

function OverviewTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sd', 'overview'],
    queryFn: () => sdApi.get<Overview>('/overview'),
    refetchInterval: 10_000,
  });
  if (isLoading) return <Loading />;
  if (error) return <Failed error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Status" value={data.status} tone={data.status === 'ok' ? 'green' : 'red'} />
        <Stat label="Database" value={data.db} tone={data.db === 'up' ? 'green' : 'red'} />
        <Stat label="Uptime" value={fmtUptime(data.uptimeSeconds)} />
        <Stat label="Node" value={data.nodeVersion} />
        <Stat label="Errors 24h" value={data.errors.last24h} tone={data.errors.last24h ? 'amber' : 'green'} />
        <Stat label="Unresolved" value={data.errors.unresolved} tone={data.errors.unresolved ? 'red' : 'green'} />
        <Stat label="RSS (MB)" value={data.memory.rssMb} />
        <Stat label="Heap (MB)" value={`${data.memory.heapUsedMb}/${data.memory.heapTotalMb}`} />
      </div>
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Data</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Users" value={data.counts.users} />
          <Stat label="Active" value={data.counts.activeUsers} />
          <Stat label="Admins" value={data.counts.admins} />
          <Stat label="Workspaces" value={data.counts.workspaces} />
          <Stat label="Projects" value={data.counts.projects} />
          <Stat label="Tasks" value={data.counts.tasks} />
          <Stat label="Sessions" value={data.counts.activeSessions} />
        </div>
      </div>
      <p className="font-mono text-[10px] text-slate-600">refreshed {fmtTime(data.generatedAt)} · auto every 10s</p>
    </div>
  );
}

// ---- Activity -----------------------------------------------------------

function ActivityTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['sd', 'activity', page],
    queryFn: () => sdApi.get<Paginated<ActivityItem>>(`/activity?page=${page}&pageSize=30`),
    refetchInterval: 15_000,
  });
  if (isLoading) return <Loading />;
  if (error) return <Failed error={error} />;
  if (!data) return null;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-3">
      <Panel className="divide-y divide-white/5">
        {data.items.length === 0 ? (
          <p className="py-8 text-center font-mono text-xs text-slate-500">no activity</p>
        ) : (
          (data.items as ActivityItem[]).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 font-mono text-xs">
              <span className="text-slate-600">{fmtTime(a.createdAt)}</span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">{a.action}</span>
              <span className="text-slate-300">{a.user.name}</span>
              {a.taskRef ? <span className="text-indigo-300">{a.taskRef}</span> : null}
              {a.workspace ? <span className="text-slate-500">· {a.workspace.name}</span> : null}
              {a.taskTitle ? <span className="truncate text-slate-500">— {a.taskTitle}</span> : null}
            </div>
          ))
        )}
      </Panel>
      <Pager page={data.page} pages={pages} total={data.total} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
    </div>
  );
}

function Pager({ page, pages, total, onPrev, onNext }: { page: number; pages: number; total: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between font-mono text-xs text-slate-500">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={onPrev} className="rounded border border-white/10 px-2 py-1 disabled:opacity-30">
          prev
        </button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={onNext} className="rounded border border-white/10 px-2 py-1 disabled:opacity-30">
          next
        </button>
      </div>
    </div>
  );
}

// ---- Errors -------------------------------------------------------------

function ErrorsTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const key = ['sd', 'errors', page, onlyOpen];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () =>
      sdApi.get<Paginated<ErrorRow>>(`/errors?page=${page}&pageSize=25${onlyOpen ? '&resolved=false' : ''}`),
  });
  const resolve = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => sdApi.patch(`/errors/${id}`, { resolved }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sd', 'errors'] }),
  });

  if (isLoading) return <Loading />;
  if (error) return <Failed error={error} />;
  if (!data) return null;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 font-mono text-xs text-slate-400">
        <input type="checkbox" checked={onlyOpen} onChange={(e) => { setOnlyOpen(e.target.checked); setPage(1); }} />
        unresolved only
      </label>
      <Panel className="divide-y divide-white/5">
        {data.items.length === 0 ? (
          <p className="py-8 text-center font-mono text-xs text-slate-500">no errors 🎉</p>
        ) : (
          (data.items as ErrorRow[]).map((row) => (
            <div key={row.id} className="px-4 py-2.5 font-mono text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-slate-600">{fmtTime(row.createdAt)}</span>
                <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-400">{row.statusCode ?? '5xx'}</span>
                <span className="text-slate-400">{row.method} {row.path}</span>
                <span className="text-slate-300">— {row.message}</span>
                <div className="ml-auto flex items-center gap-2">
                  {row.stack ? (
                    <button onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="rounded border border-white/10 px-2 py-0.5 text-slate-400">
                      {expanded === row.id ? 'hide' : 'stack'}
                    </button>
                  ) : null}
                  <button
                    onClick={() => resolve.mutate({ id: row.id, resolved: !row.resolved })}
                    className={`rounded border px-2 py-0.5 ${row.resolved ? 'border-white/10 text-slate-400' : 'border-emerald-500/30 text-emerald-400'}`}
                  >
                    {row.resolved ? 'reopen' : 'resolve'}
                  </button>
                </div>
              </div>
              {expanded === row.id && row.stack ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/50 p-3 text-[11px] leading-relaxed text-slate-400">{row.stack}</pre>
              ) : null}
            </div>
          ))
        )}
      </Panel>
      <Pager page={data.page} pages={pages} total={data.total} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
    </div>
  );
}

// ---- Users --------------------------------------------------------------

function UsersTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const adoptSession = useAuth((s) => s.adoptSession);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['sd', 'users'], queryFn: () => sdApi.get<SdUser[]>('/users') });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<SdUser, 'role' | 'isActive'>> }) => sdApi.patch(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sd', 'users'] }),
  });
  const reset = useMutation({ mutationFn: (id: string) => sdApi.post<{ tempPassword: string }>(`/users/${id}/reset-password`) });
  const forceLogout = useMutation({
    mutationFn: (id: string) => sdApi.post(`/users/${id}/force-logout`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sd', 'users'] }),
  });
  const impersonate = useMutation({
    mutationFn: (id: string) => sdApi.post<{ accessToken: string; user: Parameters<typeof adoptSession>[0] }>(`/impersonate/${id}`),
    onSuccess: (res) => {
      // Become the target user in the normal app (separate session tier). adoptSession
      // sets status='authenticated' so the normal RequireAuth gate lets us through.
      setAccessToken(res.accessToken);
      adoptSession(res.user);
      navigate('/');
    },
  });
  const createUser = useMutation({
    mutationFn: (body: { name: string; email: string; role: string; designation?: string }) =>
      sdApi.post<{ email: string; tempPassword: string }>('/users', body),
    onSuccess: (res) => {
      setNotice(`Created ${res.email}. Temp password (shown once): ${res.tempPassword}`);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['sd', 'users'] });
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <Failed error={error} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-slate-500">{(data ?? []).length} users</p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md border border-emerald-500/30 px-3 py-1.5 font-mono text-xs text-emerald-300 transition hover:bg-emerald-500/10"
        >
          {showCreate ? 'close' : '+ new user / admin'}
        </button>
      </div>
      {showCreate ? <CreateUserForm pending={createUser.isPending} onSubmit={(b) => createUser.mutate(b)} /> : null}
      {notice ? (
        <p className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 font-mono text-xs text-emerald-300">
          <span className="break-all">{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-emerald-500 hover:text-emerald-300">×</button>
        </p>
      ) : null}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[860px] font-mono text-xs">
          <thead className="border-b border-white/5 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Sessions</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data ?? []).map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <div className="text-slate-200">{u.name}</div>
                  <div className="text-slate-500">{u.email}</div>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={u.role}
                    onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value as SdUser['role'] } })}
                    className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200 outline-none"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <span className={u.isActive ? 'text-emerald-400' : 'text-amber-400'}>{u.isActive ? 'active' : 'inactive'}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-400">{u.sessionCount}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <ActionBtn onClick={() => impersonate.mutate(u.id)} disabled={!u.isActive || impersonate.isPending} tone="indigo">
                      impersonate
                    </ActionBtn>
                    <ActionBtn
                      onClick={async () => {
                        const r = await reset.mutateAsync(u.id);
                        setNotice(`Temp password for ${u.email}: ${r.tempPassword}`);
                      }}
                      disabled={reset.isPending}
                    >
                      reset pw
                    </ActionBtn>
                    <ActionBtn onClick={() => forceLogout.mutate(u.id)} disabled={forceLogout.isPending}>
                      kick
                    </ActionBtn>
                    <ActionBtn onClick={() => patch.mutate({ id: u.id, body: { isActive: !u.isActive } })} disabled={patch.isPending} tone={u.isActive ? 'red' : 'green'}>
                      {u.isActive ? 'deactivate' : 'activate'}
                    </ActionBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, tone = 'slate' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'slate' | 'red' | 'green' | 'indigo' }) {
  const c = {
    slate: 'border-white/10 text-slate-400 hover:text-slate-200',
    red: 'border-red-500/30 text-red-400 hover:bg-red-500/10',
    green: 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10',
    indigo: 'border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10',
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded border px-2 py-1 transition disabled:opacity-30 ${c}`}>
      {children}
    </button>
  );
}

function sdInput(extra = '') {
  return `w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-emerald-500/40 ${extra}`;
}

function CreateUserForm({ pending, onSubmit }: { pending: boolean; onSubmit: (b: { name: string; email: string; role: string; designation?: string }) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [designation, setDesignation] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, email, role, designation: designation.trim() || undefined });
      }}
      className="grid grid-cols-1 gap-2 rounded-xl border border-white/5 bg-[#111113] p-4 sm:grid-cols-5 sm:items-end"
    >
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase text-slate-500">Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={sdInput()} />
      </div>
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase text-slate-500">Email</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={sdInput()} />
      </div>
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase text-slate-500">Designation</label>
        <input value={designation} onChange={(e) => setDesignation(e.target.value)} className={sdInput()} />
      </div>
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase text-slate-500">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={sdInput()}>
          <option value="MEMBER">MEMBER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-500/90 px-4 py-2 font-mono text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {pending ? 'creating…' : 'create'}
      </button>
    </form>
  );
}

// ---- Workspaces ---------------------------------------------------------

function WorkspacesTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['sd', 'workspaces'], queryFn: () => sdApi.get<SdWorkspace[]>('/workspaces') });
  const create = useMutation({
    mutationFn: (body: { name: string; taskPrefix?: string }) => sdApi.post('/workspaces', body),
    onSuccess: () => {
      setName(''); setPrefix(''); setShowCreate(false); setErr(null);
      qc.invalidateQueries({ queryKey: ['sd', 'workspaces'] });
    },
    onError: (e) => setErr(errMsg(e)),
  });
  const archive = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) => sdApi.patch(`/workspaces/${id}`, { isArchived }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sd', 'workspaces'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => sdApi.del(`/workspaces/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sd', 'workspaces'] }),
  });

  if (isLoading) return <Loading />;
  if (error) return <Failed error={error} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-slate-500">{(data ?? []).length} workspaces</p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md border border-emerald-500/30 px-3 py-1.5 font-mono text-xs text-emerald-300 transition hover:bg-emerald-500/10"
        >
          {showCreate ? 'close' : '+ new workspace'}
        </button>
      </div>
      {showCreate ? (
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate({ name, taskPrefix: prefix.trim().toUpperCase() || undefined }); }}
          className="grid grid-cols-1 gap-2 rounded-xl border border-white/5 bg-[#111113] p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
        >
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-slate-500">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={sdInput()} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-slate-500">Task prefix (2-6 A-Z, optional)</label>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="ENG" className={sdInput()} />
          </div>
          <button type="submit" disabled={create.isPending} className="rounded-md bg-emerald-500/90 px-4 py-2 font-mono text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50">
            {create.isPending ? 'creating…' : 'create'}
          </button>
          {err ? <p className="font-mono text-xs text-red-400 sm:col-span-3">{err}</p> : null}
        </form>
      ) : null}
      <Panel className="overflow-x-auto">
      <table className="w-full min-w-[720px] font-mono text-xs">
        <thead className="border-b border-white/5 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Workspace</th>
            <th className="px-3 py-2 font-medium">Members</th>
            <th className="px-3 py-2 font-medium">Projects</th>
            <th className="px-3 py-2 font-medium">Tasks</th>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {(data ?? []).map((w) => (
            <tr key={w.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 text-slate-200">{w.name}</td>
              <td className="px-3 py-2.5 text-slate-400">{w.memberCount}</td>
              <td className="px-3 py-2.5 text-slate-400">{w.projectCount}</td>
              <td className="px-3 py-2.5 text-slate-400">{w.taskCount}</td>
              <td className="px-3 py-2.5">
                <span className={w.isArchived ? 'text-amber-400' : 'text-emerald-400'}>{w.isArchived ? 'archived' : 'active'}</span>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center justify-end gap-1.5">
                  <ActionBtn onClick={() => archive.mutate({ id: w.id, isArchived: !w.isArchived })} disabled={archive.isPending}>
                    {w.isArchived ? 'unarchive' : 'archive'}
                  </ActionBtn>
                  <ActionBtn
                    tone="red"
                    disabled={del.isPending}
                    onClick={() => {
                      if (confirm(`Permanently delete "${w.name}" and ALL its projects, tasks and history? This cannot be undone.`)) {
                        del.mutate(w.id);
                      }
                    }}
                  >
                    delete
                  </ActionBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </Panel>
    </div>
  );
}

// ---- Kill-switches ------------------------------------------------------

const KNOWN_FLAGS: { key: string; description: string }[] = [
  { key: 'maintenance_mode', description: 'Return 503 to all non-admin API traffic (super-dev + auth stay open).' },
];

function FlagsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['sd', 'flags'], queryFn: () => sdApi.get<Flag[]>('/flags') });
  const setFlag = useMutation({
    mutationFn: ({ key, enabled, description }: { key: string; enabled: boolean; description?: string }) => sdApi.patch(`/flags/${key}`, { enabled, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sd', 'flags'] }),
  });

  if (isLoading) return <Loading />;
  if (error) return <Failed error={error} />;

  const byKey = new Map((data ?? []).map((f) => [f.key, f]));
  // Merge server rows with the well-known switches so they always render.
  const rows = KNOWN_FLAGS.map((k) => byKey.get(k.key) ?? { key: k.key, enabled: false, description: k.description, updatedAt: '' });

  return (
    <div className="space-y-3">
      {rows.map((f) => {
        const desc = KNOWN_FLAGS.find((k) => k.key === f.key)?.description ?? f.description;
        return (
          <Panel key={f.key} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-slate-200">{f.key}</p>
              {desc ? <p className="mt-0.5 font-mono text-[11px] text-slate-500">{desc}</p> : null}
            </div>
            <button
              onClick={() => setFlag.mutate({ key: f.key, enabled: !f.enabled, description: desc ?? undefined })}
              disabled={setFlag.isPending}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition ${
                f.enabled ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              {f.enabled ? 'ON — turn off' : 'OFF — turn on'}
            </button>
          </Panel>
        );
      })}
    </div>
  );
}
