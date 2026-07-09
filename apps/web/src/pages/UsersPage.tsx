import { useState } from 'react';
import { ROLES, type Role } from '@task-tracker/shared';
import { ApiRequestError } from '../lib/api';
import { useCreateUser, useResetPassword, useUpdateUser, useUsers, useSessions, useRevokeSession } from '../hooks/useUsers';
import { Avatar } from '../components/Avatar';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';

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

export function UsersPage() {
  const { data, isLoading, error } = useUsers();
  const { data: sessionsData, isLoading: sessionsLoading, error: sessionsError } = useSessions();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();
  const revokeSession = useRevokeSession();

  const [activeTab, setActiveTab] = useState<'directory' | 'sessions'>('directory');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [designation, setDesignation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

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
            {tempPassword ? (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 dark:border-indigo-950/40 dark:bg-indigo-950/20 px-4 py-3.5 text-sm">
                <p className="font-bold text-indigo-850 dark:text-indigo-300">Temporary password (shown once)</p>
                <p className="mt-1.5 text-indigo-700 dark:text-indigo-400 font-medium">
                  Relay to <strong className="text-slate-800 dark:text-slate-200">{tempPassword.email}</strong>:{' '}
                  <code className="rounded bg-white dark:bg-slate-900 px-2 py-0.5 font-mono border border-indigo-100 dark:border-slate-800">{tempPassword.password}</code>
                </p>
                <p className="mt-1.5 text-xs text-slate-450 dark:text-slate-500 font-medium">They'll be asked to change it on first login.</p>
              </div>
            ) : null}
          </Card>

          <div className="mt-6">
            {isLoading ? (
              <Spinner />
            ) : error ? (
              <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
            ) : data && data.length > 0 ? (
              <Card className="overflow-x-auto bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/30 text-left text-[11px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Designation</th>
                      <th className="px-4 py-3 font-semibold">Workspaces</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                    {data.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                        <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-200">
                          <span className="flex items-center gap-2.5">
                            <Avatar user={u} size="sm" className="ring-2 ring-slate-100 dark:ring-slate-800/40" />
                            {u.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-505 dark:text-slate-400 font-medium">{u.email}</td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Role for ${u.name}`}
                            className="rounded-lg border border-slate-200 dark:border-slate-850 px-2 py-1 text-xs text-slate-700 dark:text-white bg-white dark:bg-[#1a1a1a] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold"
                            value={u.role}
                            onChange={(e) => updateUser.mutate({ id: u.id, patch: { role: e.target.value as Role } })}
                            disabled={updateUser.isPending}
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
                            disabled={updateUser.isPending}
                            onCommit={(next) =>
                              updateUser.mutate({ id: u.id, patch: { designation: next } })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-semibold">{u.workspaceCount ?? 0}</td>
                        <td className="px-4 py-3">
                          {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Inactive</Badge>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2.5">
                            <Button
                              variant="ghost"
                              className="text-xs py-1.5 px-3 font-semibold"
                              disabled={resetPassword.isPending}
                              onClick={async () => {
                                setFormError(null);
                                try {
                                  const res = await resetPassword.mutateAsync(u.id);
                                  setTempPassword({ email: u.email, password: res.tempPassword });
                                } catch (err) {
                                  setFormError(err instanceof ApiRequestError ? err.message : 'Failed to reset');
                                }
                              }}
                            >
                              Reset password
                            </Button>
                            <Button
                              variant={u.isActive ? 'danger' : 'ghost'}
                              className="text-xs py-1.5 px-3 font-semibold"
                              onClick={() => updateUser.mutate({ id: u.id, patch: { isActive: !u.isActive } })}
                              disabled={updateUser.isPending}
                            >
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
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
    </div>
  );
}
