import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Button, Card, Input } from '../components/ui';

export function ChangePasswordPage({
  forced = false,
  embedded = false,
}: {
  forced?: boolean;
  /** Render just the password card (no page heading) for use inside SettingsPage. */
  embedded?: boolean;
}) {
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
    <form className="space-y-4.5" onSubmit={onSubmit}>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Current password</label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New password</label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Confirm new password</label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error ? <p className="text-sm text-red-500 dark:text-red-400 font-semibold">{error}</p> : null}
      {done ? <p className="text-sm text-green-500 dark:text-green-400 font-semibold">Password updated successfully.</p> : null}
      <Button type="submit" className="w-full py-3 font-semibold text-sm shadow-md" disabled={busy}>
        {busy ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  );

  if (forced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-[#f8fafc] via-slate-50 to-indigo-50/20 dark:from-[#121212] dark:via-[#181818] dark:to-[#121212] px-4 py-12 animate-fade-in">
        <Card className="w-full max-w-md p-8 sm:p-10 shadow-2xl shadow-indigo-500/[0.02] border border-slate-200/50 dark:border-slate-800/40 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818] rounded-2xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Set a new password</h1>
            <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500 font-medium">
              You're using a temporary password. Choose a new one to continue.
            </p>
          </div>
          <div>{form}</div>
        </Card>
      </div>
    );
  }

  if (embedded) {
    return (
      <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Security</h2>
        <div>{form}</div>
      </Card>
    );
  }

  return (
    <div className="max-w-md space-y-6 animate-fade-in">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Change password</h1>
      <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">{form}</Card>
    </div>
  );
}
