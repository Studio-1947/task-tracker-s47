import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Button, Card, Input } from '../components/ui';

export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters');
    if (next !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await changePassword(current, next);
      if (forced) {
        navigate('/', { replace: true });
      } else {
        setDone(true);
        setCurrent('');
        setNext('');
        setConfirm('');
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Current password</label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">New password</label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Confirm new password</label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {done ? <p className="text-sm text-green-600">Password updated.</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  );

  if (forced) {
    return (
      <div className="flex min-h-full items-center justify-center px-4">
        <Card className="w-full max-w-sm p-8">
          <h1 className="text-xl font-semibold text-slate-800">Set a new password</h1>
          <p className="mt-1 text-sm text-slate-400">
            You're using a temporary password. Choose a new one to continue.
          </p>
          <div className="mt-6">{form}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold text-slate-800">Change password</h1>
      <Card className="mt-6 p-6">{form}</Card>
    </div>
  );
}
