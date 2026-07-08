import { useState } from 'react';
import type { Role } from '@task-tracker/shared';
import { ApiRequestError } from '../lib/api';
import { useCreateUser, useUpdateUser, useUsers } from '../hooks/useUsers';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';

export function UsersPage() {
  const { data, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setTempPassword(null);
    try {
      const created = await createUser.mutateAsync({ name, email, role });
      setTempPassword({ email: created.email, password: created.tempPassword });
      setName('');
      setEmail('');
      setRole('MEMBER');
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to create user');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Users</h1>

      <Card className="mt-6 p-5">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end" onSubmit={onCreate}>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
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
                    <td className="px-4 py-2.5 font-medium text-slate-700">{u.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{u.workspaceCount ?? 0}</td>
                    <td className="px-4 py-2.5">
                      {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant={u.isActive ? 'danger' : 'ghost'}
                        onClick={() => updateUser.mutate({ id: u.id, isActive: !u.isActive })}
                        disabled={updateUser.isPending}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
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
