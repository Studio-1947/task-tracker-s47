import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@task-tracker/shared';
import { ApiRequestError, http } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Avatar } from '../components/Avatar';
import { OrganisationCalendarCard, ScheduleGroupsCard } from '../components/CalendarAdmin';
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

function WorkforcePlanningCard() {
  const qc = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState('');
  const [userId, setUserId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [periodStart, setPeriodStart] = useState('2026-09-28');
  const [periodEnd, setPeriodEnd] = useState('2026-10-02');
  const [minutes, setMinutes] = useState(300);
  const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces', 'planning'], queryFn: () => http.get<any[]>('/workspaces') });
  const { data: members = [] } = useQuery({ queryKey: ['planning-members', workspaceId], enabled: !!workspaceId, queryFn: () => http.get<any[]>(`/workspaces/${workspaceId}/members`) });
  const { data: taskPage } = useQuery({ queryKey: ['planning-tasks', workspaceId], enabled: !!workspaceId, queryFn: () => http.get<any>(`/workspaces/${workspaceId}/tasks?pageSize=100`) });
  const { data: groups = [] } = useQuery({ queryKey: ['schedule-groups'], queryFn: () => http.get<any[]>('/calendar/schedule-groups') });
  const { data: weekly = [] } = useQuery({ queryKey: ['weekly-capacity', workspaceId, periodStart, periodEnd], enabled: !!workspaceId && !!periodStart && !!periodEnd, queryFn: () => http.get<any[]>(`/workspaces/${workspaceId}/capacity-allocations/weekly?periodStart=${periodStart}&periodEnd=${periodEnd}`) });
  const allocate = useMutation({ mutationFn: () => http.post(`/workspaces/${workspaceId}/capacity-allocations`, { userId, taskId: taskId || undefined, periodStart, periodEnd, allocatedMinutes: minutes }), onSuccess: () => qc.invalidateQueries({ queryKey: ['weekly-capacity'] }) });
  const assign = useMutation({ mutationFn: () => http.post(`/calendar/schedule-groups/${groupId}/assignments`, { userId, effectiveFrom: periodStart }), onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-groups'] }) });
  return <Card className="p-6">
    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Workforce planning</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <select className="rounded-lg border p-2 dark:bg-[#252525]" value={workspaceId} onChange={(e)=>{setWorkspaceId(e.target.value);setUserId('');setTaskId('')}}><option value="">Select workspace</option>{workspaces.map((w:any)=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
      <select className="rounded-lg border p-2 dark:bg-[#252525]" value={userId} onChange={(e)=>setUserId(e.target.value)}><option value="">Select employee</option>{members.map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <select className="rounded-lg border p-2 dark:bg-[#252525]" value={groupId} onChange={(e)=>setGroupId(e.target.value)}><option value="">Schedule group</option>{groups.map((g:any)=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <Button disabled={!userId||!groupId} onClick={()=>assign.mutate()}>Assign schedule</Button>
      <input aria-label="Capacity period start" type="date" className="rounded-lg border p-2 dark:bg-[#252525]" value={periodStart} onChange={(e)=>setPeriodStart(e.target.value)}/>
      <input aria-label="Capacity period end" type="date" className="rounded-lg border p-2 dark:bg-[#252525]" value={periodEnd} onChange={(e)=>setPeriodEnd(e.target.value)}/>
      <select className="rounded-lg border p-2 dark:bg-[#252525]" value={taskId} onChange={(e)=>setTaskId(e.target.value)}><option value="">Unallocated/reserved work</option>{(taskPage?.items??[]).map((t:any)=><option key={t.id} value={t.id}>{t.ref} - {t.title}</option>)}</select>
      <input aria-label="Allocated minutes" type="number" min="1" className="rounded-lg border p-2 dark:bg-[#252525]" value={minutes} onChange={(e)=>setMinutes(Number(e.target.value))}/>
      <Button disabled={!workspaceId||!userId||!periodStart||!periodEnd||minutes<1} onClick={()=>allocate.mutate()}>Allocate capacity</Button>
    </div>
    <div className="mt-4 space-y-2">{weekly.length===0?<p className="text-sm text-slate-500">No allocations for this period.</p>:weekly.map((row:any)=><div key={row.user.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-850"><b>{row.user.name}</b>: {row.allocatedMinutes} allocated / {row.availableMinutes} available {row.overloadMinutes>0?<span className="text-red-600">({row.overloadMinutes} min overload)</span>:null}</div>)}</div>
  </Card>;
}

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Settings</h1>
      <ProfileCard />
      {user?.role === 'ADMIN' ? <OrganisationCalendarCard /> : null}
      {user?.role === 'ADMIN' ? <ScheduleGroupsCard /> : null}
      {user?.role === 'ADMIN' ? <WorkforcePlanningCard /> : null}
      <ChangePasswordPage embedded />
    </div>
  );
}
