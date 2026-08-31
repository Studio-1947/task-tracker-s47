import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ROLES,
  USER_STATUS_LABELS,
  userStatus,
  type Role,
  type UserProjectTag,
  type UserStatus,
  type UserSummary,
} from '@task-tracker/shared';
import { ApiRequestError } from '../lib/api';
import {
  useCreateUser,
  useRemoveUser,
  useResetPassword,
  useRevokeSession,
  useSessions,
  useUpdateUser,
  useUsers,
} from '../hooks/useUsers';
import { useAuth } from '../stores/auth';
import { Avatar } from '../components/Avatar';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';

/**
 * A centred dialog. The row actions on this page all produce something the admin
 * has to read — a one-time password, a confirmation, an explanation of what a
 * removal actually did — and the old inline banner rendered up beside the create
 * form, far off screen from the row that was clicked, so those results were
 * routinely missed and the buttons looked dead.
 */
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#090d16]/50 backdrop-blur-md dark:bg-[#121212]/80" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-fade-in relative z-50 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl dark:border-slate-800/80 dark:bg-[#1c1c1c]"
      >
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * Projects a person actually has open work in. Membership of a workspace grants
 * access to all of its projects, so the count in the Workspaces column answers a
 * different question — this answers "what are they on".
 */
function ProjectTags({ projects }: { projects: UserProjectTag[] }) {
  const [expanded, setExpanded] = useState(false);
  if (projects.length === 0) {
    return <span className="text-xs font-medium text-slate-350 dark:text-slate-600">No assigned work</span>;
  }

  const shown = expanded ? projects : projects.slice(0, 2);
  return (
    <div className="flex max-w-[16rem] flex-wrap items-center gap-1">
      {shown.map((p) => {
        const color = p.color ?? '#64748b';
        return (
          <Link
            key={p.id}
            to={`/workspaces/${p.workspaceId}?project=${p.id}`}
            title={`${p.workspaceName} · ${p.name} — ${p.taskCount} open task${p.taskCount === 1 ? '' : 's'}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition hover:brightness-95"
            style={{ borderColor: `${color}55`, color, backgroundColor: `${color}14` }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate">{p.name}</span>
            <span className="shrink-0 opacity-70">{p.taskCount}</span>
          </Link>
        );
      })}
      {projects.length > 2 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-slate-400 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
        >
          {expanded ? 'less' : `+${projects.length - 2}`}
        </button>
      ) : null}
    </div>
  );
}

/** Inline-editable designation: commits on blur or Enter, only when changed. */
function DesignationCell({
  value,
  userName,
  disabled,
  onCommit,
}: {
  value: string | null;
  userName: string;
  disabled: boolean;
  onCommit: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const commit = () => {
    const next = draft.trim() || null;
    if (next !== (value ?? null)) onCommit(next);
  };
  return (
    <input
      aria-label={`Designation for ${userName}`}
      className="w-36 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-650 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none dark:text-slate-300 dark:hover:border-slate-700 dark:focus:border-indigo-500 dark:focus:bg-slate-800"
      value={draft}
      placeholder="—"
      maxLength={120}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown Device';
  const uaLower = ua.toLowerCase();
  
  // OS Detection
  let os = 'Unknown OS';
  if (uaLower.includes('windows')) os = 'Windows';
  else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) os = 'macOS';
  else if (uaLower.includes('linux')) os = 'Linux';
  else if (uaLower.includes('android')) os = 'Android';
  else if (uaLower.includes('iphone') || uaLower.includes('ipad')) os = 'iOS';
  
  // Browser Detection
  let browser = 'Unknown Browser';
  if (uaLower.includes('firefox')) browser = 'Firefox';
  else if (uaLower.includes('chrome') || uaLower.includes('chromium')) browser = 'Chrome';
  else if (uaLower.includes('safari') && !uaLower.includes('chrome')) browser = 'Safari';
  else if (uaLower.includes('edge')) browser = 'Edge';
  
  return `${os} / ${browser}`;
}

/**
 * One section of the directory. Rendered twice — once for people who can sign in
 * and once for those who can't — because a suspended account and an offboarded
 * one need different actions, and mixing them into a single list is what made
 * "remove" look like it had done nothing.
 */
function UserTable({
  users,
  currentUserId,
  busy,
  onRole,
  onDesignation,
  onReset,
  onDeactivate,
  onReactivate,
  onRemove,
}: {
  users: UserSummary[];
  currentUserId?: string;
  busy: boolean;
  onRole: (u: UserSummary, role: Role) => void;
  onDesignation: (u: UserSummary, designation: string | null) => void;
  onReset: (u: UserSummary) => void;
  onDeactivate: (u: UserSummary) => void;
  onReactivate: (u: UserSummary) => void;
  onRemove: (u: UserSummary) => void;
}) {
  return (
    <Card className="overflow-x-auto bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="bg-slate-50/80 dark:bg-slate-900/30 text-left text-[11px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
          <tr>
            <th className="px-5 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Role</th>
            <th className="px-4 py-3 font-semibold">Designation</th>
            <th className="px-4 py-3 font-semibold">Projects</th>
            <th className="px-4 py-3 font-semibold">Workspaces</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-5 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
          {users.map((u) => {
            const status = userStatus(u);
            const isMe = u.id === currentUserId;
            return (
              <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-2.5">
                    <Avatar user={u} size="sm" className="ring-2 ring-slate-100 dark:ring-slate-800/40" />
                    <span className={status === 'REMOVED' ? 'text-slate-450 dark:text-slate-500' : ''}>{u.name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-505 dark:text-slate-400 font-medium">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Role for ${u.name}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-850 px-2 py-1 text-xs text-slate-700 dark:text-white bg-white dark:bg-[#1a1a1a] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold disabled:opacity-60"
                    value={u.role}
                    onChange={(e) => onRole(u, e.target.value as Role)}
                    disabled={busy || isMe || status === 'REMOVED'}
                    title={isMe ? 'You cannot change your own role' : undefined}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <DesignationCell
                    key={`${u.id}-${u.designation ?? ''}`}
                    value={u.designation}
                    userName={u.name}
                    disabled={busy || status === 'REMOVED'}
                    onCommit={(next) => onDesignation(u, next)}
                  />
                </td>
                <td className="px-4 py-3">
                  <ProjectTags projects={u.projects ?? []} />
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-semibold">{u.workspaceCount ?? 0}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={status} removedAt={u.removedAt} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2.5">
                    {/* A removed account is offboarded; handing out a new password
                        for it would only invite signing them back in by accident. */}
                    {status === 'REMOVED' ? null : (
                      <Button
                        variant="ghost"
                        className="text-xs py-1.5 px-3 font-semibold"
                        disabled={busy}
                        onClick={() => onReset(u)}
                      >
                        Reset password
                      </Button>
                    )}
                    {status === 'ACTIVE' ? (
                      <Button
                        variant="danger"
                        className="text-xs py-1.5 px-3 font-semibold"
                        // Deactivating yourself would end your own session mid-click.
                        disabled={busy || isMe}
                        title={isMe ? 'You cannot deactivate your own account' : undefined}
                        onClick={() => onDeactivate(u)}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="text-xs py-1.5 px-3 font-semibold"
                        disabled={busy}
                        onClick={() => onReactivate(u)}
                      >
                        Reactivate
                      </Button>
                    )}
                    {status === 'REMOVED' ? null : (
                      <Button
                        variant="danger"
                        className="text-xs py-1.5 px-3 font-semibold"
                        disabled={busy || isMe}
                        title={isMe ? 'You cannot remove your own account' : undefined}
                        onClick={() => onRemove(u)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** Active / Deactivated / Removed, with the removal date where there is one. */
function StatusBadge({ status, removedAt }: { status: UserStatus; removedAt: string | null }) {
  if (status === 'ACTIVE') return <Badge tone="green">{USER_STATUS_LABELS.ACTIVE}</Badge>;
  if (status === 'DEACTIVATED') return <Badge tone="amber">{USER_STATUS_LABELS.DEACTIVATED}</Badge>;
  return (
    <span
      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400"
      title={removedAt ? `Removed on ${new Date(removedAt).toLocaleDateString()}` : undefined}
    >
      {USER_STATUS_LABELS.REMOVED}
    </span>
  );
}

export function UsersPage() {
  const { data, isLoading, error } = useUsers();
  const { data: sessionsData, isLoading: sessionsLoading, error: sessionsError } = useSessions();
  const { user: me } = useAuth();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();
  const removeUser = useRemoveUser();
  const revokeSession = useRevokeSession();

  const [activeTab, setActiveTab] = useState<'directory' | 'sessions'>('directory');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [designation, setDesignation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  /** The row action awaiting confirmation — both are destructive and irreversible. */
  const [pending, setPending] = useState<{
    kind: 'reset' | 'remove' | 'reinstate';
    user: UserSummary;
  } | null>(null);
  const [removed, setRemoved] = useState<{ name: string; deleted: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Pagination for Active Sessions (displays 10 per page max)
  const [sessionPage, setSessionPage] = useState(1);
  const sessionPageSize = 10;
  const totalSessionPages = sessionsData ? Math.max(1, Math.ceil(sessionsData.length / sessionPageSize)) : 1;
  const paginatedSessions = (sessionsData ?? []).slice(
    (sessionPage - 1) * sessionPageSize,
    sessionPage * sessionPageSize,
  );

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setTempPassword(null);
    try {
      const created = await createUser.mutateAsync({
        name,
        email,
        role,
        designation: designation.trim() || undefined,
      });
      setTempPassword({ email: created.email, password: created.tempPassword });
      setName('');
      setEmail('');
      setRole('MEMBER');
      setDesignation('');
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to create user');
    }
  };

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiRequestError ? err.message : fallback;

  // Three buckets, because the three states support different actions.
  const activeUsers = (data ?? []).filter((u) => userStatus(u) === 'ACTIVE');
  const deactivatedUsers = (data ?? []).filter((u) => userStatus(u) === 'DEACTIVATED');
  const removedUsers = (data ?? []).filter((u) => userStatus(u) === 'REMOVED');
  const formerCount = deactivatedUsers.length + removedUsers.length;

  const patchUser = (u: UserSummary, patch: Parameters<typeof updateUser.mutate>[0]['patch']) => {
    setActionError(null);
    updateUser.mutate(
      { id: u.id, patch },
      { onError: (err) => setActionError(message(err, 'Could not update the user')) },
    );
  };

  const tableProps = {
    currentUserId: me?.id,
    busy: updateUser.isPending || resetPassword.isPending || removeUser.isPending,
    onRole: (u: UserSummary, role: Role) => patchUser(u, { role }),
    onDesignation: (u: UserSummary, designation: string | null) => patchUser(u, { designation }),
    onReset: (u: UserSummary) => {
      setActionError(null);
      setPending({ kind: 'reset', user: u });
    },
    onDeactivate: (u: UserSummary) => patchUser(u, { isActive: false }),
    // Reinstating a removed person restores the login but not what removal took
    // away, so that one is confirmed rather than applied on the spot.
    onReactivate: (u: UserSummary) => {
      setActionError(null);
      if (userStatus(u) === 'REMOVED') setPending({ kind: 'reinstate', user: u });
      else patchUser(u, { isActive: true });
    },
    onRemove: (u: UserSummary) => {
      setActionError(null);
      setPending({ kind: 'remove', user: u });
    },
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { kind, user } = pending;
    setPending(null);
    setActionError(null);
    try {
      if (kind === 'reset') {
        const res = await resetPassword.mutateAsync(user.id);
        setTempPassword({ email: user.email, password: res.tempPassword });
      } else if (kind === 'reinstate') {
        await updateUser.mutateAsync({ id: user.id, patch: { isActive: true } });
      } else {
        const res = await removeUser.mutateAsync(user.id);
        setRemoved({ name: user.name, deleted: res.deleted });
      }
    } catch (err) {
      const fallback = {
        reset: 'Could not reset the password',
        remove: 'Could not remove the user',
        reinstate: 'Could not reinstate the user',
      }[kind];
      setActionError(message(err, fallback));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Users & Authentication</h1>
        
        {/* Tab Switcher */}
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all duration-150 cursor-pointer ${
              activeTab === 'directory'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Directory
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all duration-150 cursor-pointer ${
              activeTab === 'sessions'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Active Sessions
          </button>
        </div>
      </div>

      {activeTab === 'directory' ? (
        <>
          <Card className="mt-6 p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-5 sm:items-end" onSubmit={onCreate}>
              <div className="sm:col-span-1">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="sm:col-span-1">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="sm:col-span-1">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Designation</label>
                <Input placeholder="Director, Analyst…" value={designation} onChange={(e) => setDesignation(e.target.value)} />
              </div>
              <div className="sm:col-span-1">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Role</label>
                <select
                  aria-label="New user role"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3.5 py-2.5 text-sm text-slate-700 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="py-2.5 font-semibold" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create user'}
              </Button>
            </form>
            {formError ? <p className="mt-2 text-sm text-red-650 dark:text-red-400 font-medium">{formError}</p> : null}
          </Card>

          {actionError ? (
            <div className="mt-4">
              <ErrorState message={actionError} />
            </div>
          ) : null}

          <div className="mt-6">
            {isLoading ? (
              <Spinner />
            ) : error ? (
              <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
            ) : data && data.length > 0 ? (
              <div className="space-y-8">
                <section>
                  <h2 className="mb-2.5 px-1 text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500">
                    Team · {activeUsers.length}
                  </h2>
                  {activeUsers.length === 0 ? (
                    <EmptyState title="Nobody active" hint="Every account is currently deactivated or removed." />
                  ) : (
                    <UserTable users={activeUsers} {...tableProps} />
                  )}
                </section>

                {/* Kept out of the team list entirely: these people cannot sign in,
                    and lumping them in with everyone else is what made a removal
                    look like nothing had happened. */}
                {formerCount > 0 ? (
                  <section>
                    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 px-1">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500">
                        No longer active · {formerCount}
                      </h2>
                      <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                        {deactivatedUsers.length} deactivated (suspended, comes back intact) ·{' '}
                        {removedUsers.length} removed (off every workspace, assignments released)
                      </p>
                    </div>
                    <div className="space-y-4">
                      {deactivatedUsers.length > 0 ? <UserTable users={deactivatedUsers} {...tableProps} /> : null}
                      {removedUsers.length > 0 ? <UserTable users={removedUsers} {...tableProps} /> : null}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : (
              <EmptyState title="No users yet" hint="Create your first user above." />
            )}
          </div>
        </>
      ) : (
        <div className="mt-6">
          {sessionsLoading ? (
            <Spinner />
          ) : sessionsError ? (
            <ErrorState message={sessionsError instanceof ApiRequestError ? sessionsError.message : 'Failed to load active sessions'} />
          ) : sessionsData && sessionsData.length > 0 ? (
            <>
              <Card className="overflow-x-auto bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/30 text-left text-[11px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
                    <tr>
                      <th className="px-5 py-3 font-semibold">User</th>
                      <th className="px-4 py-3 font-semibold">IP Address</th>
                      <th className="px-4 py-3 font-semibold">Device / Browser</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      <th className="px-4 py-3 font-semibold">Last Active</th>
                      <th className="px-5 py-3 text-right">
                        <span>Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                    {paginatedSessions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                        <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-200">
                          <span className="flex items-center gap-2.5">
                            <Avatar user={{ id: s.userId, name: s.userName, avatarKey: s.userAvatarKey }} size="sm" className="ring-2 ring-slate-100 dark:ring-slate-800/40" />
                            <div className="min-w-0">
                              <div className="truncate text-slate-700 dark:text-slate-200 font-bold">{s.userName}</div>
                              <div className="truncate text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">{s.userEmail}</div>
                            </div>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">{s.ipAddress || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-350 font-semibold text-xs" title={s.userAgent ?? ''}>
                          {parseUserAgent(s.userAgent)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-455 font-medium text-xs">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-550 dark:text-slate-400 font-bold text-xs">
                          {new Date(s.lastActiveAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="danger"
                            className="text-xs py-1 px-3 font-semibold"
                            onClick={() => revokeSession.mutate(s.id)}
                            disabled={revokeSession.isPending}
                          >
                            {revokeSession.isPending ? 'Kicking…' : 'Revoke Session'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              
              {/* Pagination Controls - Limit to 10 items per page */}
              {sessionsData.length > 10 ? (
                <div className="mt-3.5 flex items-center justify-between px-1.5">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                    Showing {(sessionPage - 1) * sessionPageSize + 1} - {Math.min(sessionPage * sessionPageSize, sessionsData.length)} of {sessionsData.length} active sessions
                  </p>
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Button variant="ghost" className="py-1 px-3" disabled={sessionPage <= 1} onClick={() => setSessionPage((p) => p - 1)}>
                      Prev
                    </Button>
                    <span className="text-slate-550 dark:text-slate-400 min-w-12 text-center">
                      {sessionPage} / {totalSessionPages}
                    </span>
                    <Button variant="ghost" className="py-1 px-3" disabled={sessionPage >= totalSessionPages} onClick={() => setSessionPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3.5 px-1.5">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                    {sessionsData.length} active session(s) listed
                  </p>
                </div>
              )}
            </>
          ) : (
            <EmptyState title="No active sessions" hint="Active user sessions will appear here once users log in." />
          )}
        </div>
      )}

      {pending ? (
        <Dialog
          title={
            pending.kind === 'reset'
              ? 'Reset this password?'
              : pending.kind === 'reinstate'
                ? `Bring ${pending.user.name} back?`
                : `Remove ${pending.user.name}?`
          }
          onClose={() => setPending(null)}
        >
          {pending.kind === 'reinstate' ? (
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-350">
              <p>
                <strong className="text-slate-800 dark:text-slate-200">{pending.user.name}</strong> will be
                able to sign in again with their existing password.
              </p>
              <p className="text-xs text-slate-450 dark:text-slate-500">
                Removing them dropped their workspaces and released their task assignments, and those do
                not come back — you'll need to add them to their workspaces again.
              </p>
            </div>
          ) : pending.kind === 'reset' ? (
            <p className="text-sm text-slate-600 dark:text-slate-350">
              <strong className="text-slate-800 dark:text-slate-200">{pending.user.name}</strong> will be
              signed out everywhere and their current password stops working straight away. You'll get a
              one-time password to pass on — it is shown once and cannot be looked up later.
            </p>
          ) : (
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-350">
              <p>
                <strong className="text-slate-800 dark:text-slate-200">{pending.user.name}</strong> will be
                signed out, dropped from every workspace, unassigned from their tasks and deactivated.
              </p>
              <p className="text-xs text-slate-450 dark:text-slate-500">
                Their account is deleted outright if nothing references it. Anyone who has already created
                or commented on something keeps a deactivated row, so the history they're named in stays
                readable.
              </p>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending.kind === 'reinstate' ? 'primary' : 'danger'}
              className="px-3 py-2 text-xs"
              disabled={resetPassword.isPending || removeUser.isPending || updateUser.isPending}
              onClick={() => void confirmPending()}
            >
              {pending.kind === 'reset'
                ? 'Reset password'
                : pending.kind === 'reinstate'
                  ? 'Reinstate'
                  : 'Remove user'}
            </Button>
          </div>
        </Dialog>
      ) : null}

      {tempPassword ? (
        <Dialog title="Temporary password (shown once)" onClose={() => setTempPassword(null)}>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-350">
            Relay to <strong className="text-slate-800 dark:text-slate-200">{tempPassword.email}</strong>:
          </p>
          <code className="mt-2 block select-all break-all rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 text-center font-mono text-base font-bold text-indigo-800 dark:border-indigo-950/40 dark:bg-indigo-950/20 dark:text-indigo-300">
            {tempPassword.password}
          </code>
          <p className="mt-2 text-xs font-medium text-slate-450 dark:text-slate-500">
            They'll be asked to change it on first login. Copy it now — it isn't stored anywhere.
          </p>
          <div className="mt-5 flex justify-end">
            <Button className="px-3 py-2 text-xs" onClick={() => setTempPassword(null)}>
              Done
            </Button>
          </div>
        </Dialog>
      ) : null}

      {removed ? (
        <Dialog title={`${removed.name} removed`} onClose={() => setRemoved(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-350">
            {removed.deleted
              ? 'Their account has been deleted outright — nothing in the workspace referenced it.'
              : 'They are signed out, off every workspace, unassigned from their tasks and deactivated. Their account row was kept because existing tasks, comments or history still name them.'}
          </p>
          <div className="mt-5 flex justify-end">
            <Button className="px-3 py-2 text-xs" onClick={() => setRemoved(null)}>
              Done
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
