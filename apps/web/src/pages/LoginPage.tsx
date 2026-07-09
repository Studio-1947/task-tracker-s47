import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Button, Card, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-[#f8fafc] via-slate-50 to-indigo-50/20 dark:from-[#121212] dark:via-[#181818] dark:to-[#121212] px-4 py-12 animate-fade-in">
      <Card className="w-full max-w-md p-8 sm:p-10 shadow-2xl shadow-indigo-500/[0.02] border border-slate-200/50 dark:border-slate-800/40 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818] rounded-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/20 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Welcome back</h1>
          <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500 font-medium">Task Tracker Portal Control Center</p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email Address</label>
            <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Password</label>
            <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error ? <p className="text-sm text-red-500 dark:text-red-400 font-semibold">{error}</p> : null}
          <Button type="submit" className="w-full py-3 font-semibold text-sm shadow-md" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in to dashboard'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
