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
      className="w-36 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-600 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none"
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
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Users</h1>

      <Card className="mt-6 p-5">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end" onSubmit={onCreate}>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Designation <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Designer"
              maxLength={120}
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">Role</label>
            <select
              aria-label="User role"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <Button type="submit" disabled={createUser.isPending}>
            {createUser.isPending ? 'Creating…' : 'Create user'}
          </Button>
        </form>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        {tempPassword ? (
          <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
            <p className="font-medium text-indigo-800">Temporary password (shown once)</p>
            <p className="mt-1 text-indigo-700">
              Relay to <strong>{tempPassword.email}</strong>:{' '}
              <code className="rounded bg-white px-2 py-0.5 font-mono">{tempPassword.password}</code>
            </p>
            <p className="mt-1 text-xs text-indigo-500">They'll be asked to change it on first login.</p>
          </div>
        ) : null}
      </Card>

      <div className="mt-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error instanceof ApiRequestError ? error.message : 'Failed to load'} />
        ) : data && data.length > 0 ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Designation</th>
                  <th className="px-4 py-2 font-medium">Workspaces</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      <span className="flex items-center gap-2">
                        <Avatar user={u} size="sm" />
                        {u.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <select
                        aria-label={`Role for ${u.name}`}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
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
                    <td className="px-4 py-2.5">
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
                    <td className="px-4 py-2.5 text-slate-500">{u.workspaceCount ?? 0}</td>
                    <td className="px-4 py-2.5">
                      {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
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
