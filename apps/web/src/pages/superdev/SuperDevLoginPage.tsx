import { useState } from 'react';
import { ApiRequestError } from '../../lib/api';
import { useSuperDev } from '../../stores/superdev';

/**
 * Standalone login for the hidden console. Intentionally styled unlike the rest of
 * the app and reveals nothing about what lies behind it. If the feature is disabled
 * server-side, login simply 404s and the generic error shows.
 */
export function SuperDevLoginPage() {
  const login = useSuperDev((s) => s.login);
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
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      setError(status === 404 ? 'Not available.' : 'Access denied.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-4 text-slate-200">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 font-mono text-lg font-bold text-emerald-400">
            $_
          </div>
          <h1 className="font-mono text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
            root console
          </h1>
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-white/5 bg-[#111113] p-6 shadow-2xl"
        >
          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-500">
              identity
            </label>
            <input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm text-emerald-300 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-500">
              secret
            </label>
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm text-emerald-300 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
            />
          </div>
          {error ? <p className="font-mono text-xs text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-500/90 px-4 py-2.5 font-mono text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? 'authenticating…' : 'authenticate'}
          </button>
        </form>
      </div>
    </div>
  );
}
