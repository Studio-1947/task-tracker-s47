import { useState } from 'react';
import { ROLES, type Role } from '@task-tracker/shared';
import { ApiRequestError } from '../lib/api';
import { useCreateUser, useResetPassword, useUpdateUser, useUsers } from '../hooks/useUsers';
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
      className="w-36 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-600 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none dark:text-slate-300 dark:hover:border-slate-700 dark:focus:border-indigo-500 dark:focus:bg-slate-800"
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
export function UsersPage() {
  const { data, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [designation, setDesignation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

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
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Users</h1>

      <Card className="mt-6 p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-5 sm:items-end" onSubmit={onCreate}>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Designation <span className="font-normal text-slate-400 dark:text-slate-500 text-[10px]">(optional)</span>
            </label>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Designer"
              maxLength={120}
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Role</label>
            <select
              aria-label="User role"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
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
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium">They'll be asked to change it on first login.</p>
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
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-medium">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${u.name}`}
                        className="rounded-lg border border-slate-200 dark:border-slate-850 px-2 py-1 text-xs text-slate-700 dark:text-white bg-white dark:bg-slate-900/60 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold"
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
    </div>
  );
}
