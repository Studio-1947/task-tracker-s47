import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, CalendarException, CalendarSettings } from '@task-tracker/shared';
import { ApiRequestError, http } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Avatar } from '../components/Avatar';
import { Button, Card } from '../components/ui';
import { ChangePasswordPage } from './ChangePasswordPage';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

function ProfileCard() {
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const afterChange = (updated: AuthUser) => {
    setUser(updated);
    // User refs (comments, activity, assignees, search) embed the avatar key.
    void queryClient.invalidateQueries();
  };

  const onPick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Image must be 2 MB or smaller.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      afterChange(await http.upload<AuthUser>('/me/avatar', form));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      afterChange(await http.del<AuthUser>('/me/avatar'));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to remove picture');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Profile Details</h2>
      <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar user={user} size="lg" className="ring-4 ring-slate-100 dark:ring-slate-800/40" />
        <div className="min-w-0">
          <p className="font-bold text-slate-800 dark:text-slate-100 text-lg">{user.name}</p>
          <p className="text-sm font-semibold text-slate-450 dark:text-slate-500 mt-0.5">{user.email}</p>
          {user.designation ? <p className="text-sm font-semibold text-slate-450 dark:text-slate-500 mt-0.5">{user.designation}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              aria-label="Choose profile picture"
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button variant="ghost" className="text-xs py-2 px-3" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? 'Working…' : user.avatarKey ? 'Change picture' : 'Upload picture'}
            </Button>
            {user.avatarKey ? (
              <Button variant="danger" className="text-xs py-2 px-3" disabled={busy} onClick={() => void onRemove()}>
                Remove
              </Button>
            ) : null}
          </div>
          <p className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">PNG, JPG, WebP or GIF — up to 2 MB.</p>
          {error ? <p className="mt-2 text-sm text-red-650 dark:text-red-400 font-medium">{error}</p> : null}
        </div>
      </div>
    </Card>
  );
}

function CalendarSettingsCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['calendar'], queryFn: () => http.get<{ settings: CalendarSettings; exceptions: CalendarException[] }>('/calendar') });
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionName, setExceptionName] = useState('');
  const [kind, setKind] = useState<'HOLIDAY' | 'HALF_DAY' | 'WORKING_DAY'>('HOLIDAY');
  const refresh = () => qc.invalidateQueries({ queryKey: ['calendar'] });
  const update = useMutation({ mutationFn: (settings: CalendarSettings) => http.put('/calendar', { ...settings, changeReason: 'Organisation calendar settings updated by administrator' }), onSuccess: refresh });
  const add = useMutation({ mutationFn: () => http.post('/calendar/exceptions', { date: exceptionDate, name: exceptionName, kind }), onSuccess: () => { setExceptionDate(''); setExceptionName(''); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => http.del(`/calendar/exceptions/${id}`), onSuccess: refresh });
  const settings = data?.settings;
  if (!settings) return <Card className="p-6"><p className="text-sm text-slate-500">Loading organisation calendar...</p></Card>;
  const save = (patch: Partial<CalendarSettings>) => update.mutate({ ...settings, ...patch });
  return (
    <Card className="p-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Organisation calendar</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm">Timezone<input className="mt-1 w-full rounded-lg border p-2 dark:bg-[#252525]" value={settings.timezone} onChange={(e) => save({ timezone: e.target.value })} /></label>
        <label className="text-sm">Effective from<input type="date" className="mt-1 w-full rounded-lg border p-2 dark:bg-[#252525]" value={settings.effectiveFrom} onChange={(e) => save({ effectiveFrom: e.target.value })} /></label>
        <label className="text-sm">Start time<input type="time" className="mt-1 w-full rounded-lg border p-2 dark:bg-[#252525]" value={`${String(Math.floor(settings.startMinute / 60)).padStart(2,'0')}:${String(settings.startMinute % 60).padStart(2,'0')}`} onChange={(e) => { const [h,m] = e.target.value.split(':').map(Number); save({ startMinute: h! * 60 + m! }); }} /></label>
        <label className="text-sm">End time<input type="time" className="mt-1 w-full rounded-lg border p-2 dark:bg-[#252525]" value={`${String(Math.floor(settings.endMinute / 60)).padStart(2,'0')}:${String(settings.endMinute % 60).padStart(2,'0')}`} onChange={(e) => { const [h,m] = e.target.value.split(':').map(Number); save({ endMinute: h! * 60 + m! }); }} /></label>
        <label className="text-sm">Unpaid break (minutes)<input type="number" min="0" className="mt-1 w-full rounded-lg border p-2 dark:bg-[#252525]" value={settings.unpaidBreakMinutes} onChange={(e) => save({ unpaidBreakMinutes: Number(e.target.value) })} /></label>
        <div className="text-sm"><span>Working days</span><div className="mt-2 flex gap-1">{['S','M','T','W','T','F','S'].map((label, day) => <button type="button" key={day} onClick={() => save({ workdays: settings.workdays.includes(day) ? settings.workdays.filter((d) => d !== day) : [...settings.workdays, day].sort() })} className={`h-8 w-8 rounded-full text-xs font-bold ${settings.workdays.includes(day) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{label}</button>)}</div></div>
      </div>
      <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">Holidays and exceptions</h3>
      <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <input type="date" required className="rounded-lg border p-2 dark:bg-[#252525]" value={exceptionDate} onChange={(e) => setExceptionDate(e.target.value)} />
        <input required placeholder="Name" className="rounded-lg border p-2 dark:bg-[#252525]" value={exceptionName} onChange={(e) => setExceptionName(e.target.value)} />
        <select className="rounded-lg border p-2 dark:bg-[#252525]" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="HOLIDAY">Holiday</option><option value="HALF_DAY">Half-day</option><option value="WORKING_DAY">Working day</option></select>
        <Button type="submit">Add</Button>
      </form>
      <div className="mt-3 space-y-2">{data?.exceptions.map((x) => <div key={x.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-850"><span><b>{x.date}</b> - {x.name} ({x.kind.toLowerCase().replace('_',' ')})</span><Button variant="danger" className="px-2 py-1 text-xs" onClick={() => remove.mutate(x.id)}>Remove</Button></div>)}</div>
    </Card>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Settings</h1>
      <ProfileCard />
      {user?.role === 'ADMIN' ? <CalendarSettingsCard /> : null}
      <ChangePasswordPage embedded />
    </div>
  );
}
