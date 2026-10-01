import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarException, CalendarSettings } from '@task-tracker/shared';
import { ApiRequestError, http } from '../lib/api';
import { useCalendar } from '../hooks/useCalendar';
import { useUsers } from '../hooks/useUsers';
import { Button, Card } from './ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const input = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-[#252525] dark:text-white';
const h2 = 'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const MONTHS: Record<string, string> = { January:'01', February:'02', March:'03', April:'04', May:'05', June:'06', July:'07', August:'08', September:'09', October:'10', November:'11', December:'12' };
const WEEKDAYS = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
/** Converts text extracted from a common month/year holiday-table PDF into the same editable CSV preview. */
function holidayRowsFromPdf(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim(); const out: string[] = [];
  const headings = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/g;
  const found = [...compact.matchAll(headings)];
  for (let i = 0; i < found.length; i++) { const heading = found[i]!; const month = heading[1]!; const year = heading[2]!; const body = compact.slice((heading.index ?? 0) + heading[0].length, found[i + 1]?.index ?? compact.length); const row = new RegExp(`\\b(\\d{1,2})\\s+[A-Za-z]{3}\\s+${WEEKDAYS}\\s+(.+?)(?=\\s+\\d{1,2}\\s+[A-Za-z]{3}\\s+${WEEKDAYS}|$)`, 'g'); for (const m of body.matchAll(row)) { const name = m[2]!.replace(/\s+(?:Office trip|Holiday|Type|Yearly|Monthly).*$/i, '').trim(); if (name) out.push(`${year}-${MONTHS[month]!}-${m[1]!.padStart(2,'0')}, ${name}, HOLIDAY`); } }
  return [...new Set(out)].join('\n');
}
const hoursLabel = (start: number, end: number, brk: number) => {
  const mins = end - start - brk;
  return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''} of working time`;
};
const errMsg = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Something went wrong');

function WorkdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div role="group" aria-label="Working days" className="mt-2 flex flex-wrap gap-1">
      {DAYS.map((label, day) => {
        const on = value.includes(day);
        return (
          <button
            type="button"
            key={day}
            aria-pressed={on}
            aria-label={label}
            onClick={() => onChange(on ? value.filter((d) => d !== day) : [...value, day].sort())}
            className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}
          >
            {label.slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Organisation calendar (spec section 2). Edits are a draft that is saved once,
 * with a required reason: each save is a new effective-dated calendar version, so
 * approved historical records keep the calendar they were approved under.
 */
export function OrganisationCalendarCard() {
  const qc = useQueryClient();
  const { data } = useCalendar();
  const { data: history = [] } = useQuery({
    queryKey: ['calendar', 'history'],
    queryFn: () =>
      http.get<Array<{ id: string; timezone: string; workdays: number[]; startMinute: number; endMinute: number; unpaidBreakMinutes: number; effectiveFrom: string; changeReason: string; createdAt: string }>>('/calendar/history'),
  });
  const [draft, setDraft] = useState<CalendarSettings | null>(null);
  const [reason, setReason] = useState('');
  const [exDate, setExDate] = useState('');
  const [exName, setExName] = useState('');
  const [kind, setKind] = useState<CalendarException['kind']>('HOLIDAY');
  const [bulkText, setBulkText] = useState('');
  const [bulkMode, setBulkMode] = useState<'ADD_ONLY'|'REPLACE_MATCHING'>('ADD_ONLY');
  const bulkRows = useMemo(() => bulkText.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const [date,name,rawKind] = line.split(',').map(x=>x.trim()); return { date: date ?? '', name: name ?? '', kind: (rawKind || 'HOLIDAY').toUpperCase() }; }).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.name), [bulkText]);
  useEffect(() => {
    if (data?.settings && !draft) setDraft(data.settings);
  }, [data, draft]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['calendar'] });
  };
  const save = useMutation({
    mutationFn: (s: CalendarSettings) => http.put('/calendar', { ...s, changeReason: reason.trim() }),
    onSuccess: () => { setReason(''); refresh(); },
  });
  const addEx = useMutation({
    mutationFn: () => http.post('/calendar/exceptions', { date: exDate, name: exName, kind }),
    onSuccess: () => { setExDate(''); setExName(''); refresh(); },
  });
  const removeEx = useMutation({ mutationFn: (id: string) => http.del(`/calendar/exceptions/${id}`), onSuccess: refresh });
  const bulk = useMutation({ mutationFn: () => http.post('/calendar/exceptions/bulk', { mode: bulkMode, exceptions: bulkRows }), onSuccess: () => { setBulkText(''); refresh(); } });
  const pdfImport = useMutation({ mutationFn: async (file: File) => { const form = new FormData(); form.append('file', file); return http.upload<{ text: string }>('/calendar/exceptions/import-pdf', form); }, onSuccess: (r) => setBulkText(holidayRowsFromPdf(r.text)) });

  const dirty = useMemo(() => !!draft && !!data && JSON.stringify(draft) !== JSON.stringify(data.settings), [draft, data]);
  if (!data || !draft) return <Card className="p-6"><p className="text-sm text-slate-500">Loading organisation calendar…</p></Card>;
  const invalid = draft.endMinute <= draft.startMinute + draft.unpaidBreakMinutes || draft.workdays.length === 0;

  return (
    <Card className="p-6">
      <h2 className={h2}>Organisation calendar</h2>
      <p className="mt-1 text-xs text-slate-500">
        Drives attendance, leave, capacity, reminders and overdue ageing. Saving creates a new effective-dated version.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">Timezone<input className={input} value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} /></label>
        <label className="text-sm">Effective from<input type="date" className={input} value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} /></label>
        <label className="text-sm">Start time<input type="time" className={input} value={toTime(draft.startMinute)} onChange={(e) => setDraft({ ...draft, startMinute: fromTime(e.target.value) })} /></label>
        <label className="text-sm">End time<input type="time" className={input} value={toTime(draft.endMinute)} onChange={(e) => setDraft({ ...draft, endMinute: fromTime(e.target.value) })} /></label>
        <label className="text-sm">Unpaid break (minutes)<input type="number" min="0" className={input} value={draft.unpaidBreakMinutes} onChange={(e) => setDraft({ ...draft, unpaidBreakMinutes: Number(e.target.value) })} /></label>
        <div className="text-sm">
          <span>Working days</span>
          <WorkdayPicker value={draft.workdays} onChange={(workdays) => setDraft({ ...draft, workdays })} />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {invalid ? 'Choose at least one working day and a schedule with positive working time.' : `${hoursLabel(draft.startMinute, draft.endMinute, draft.unpaidBreakMinutes)} per working day.`}
      </p>
      {dirty ? (
        <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
          <label className="block text-sm font-medium text-amber-900 dark:text-amber-200">
            Reason for this change
            <input aria-label="Reason for calendar change" className={input} placeholder="e.g. Summer hours from 1 June" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button disabled={invalid || !reason.trim() || save.isPending} onClick={() => save.mutate(draft)}>Save new version</Button>
            <Button variant="ghost" onClick={() => { setDraft(data.settings); setReason(''); }}>Discard</Button>
          </div>
          {save.error ? <p className="text-sm text-red-600">{errMsg(save.error)}</p> : null}
        </div>
      ) : null}

      <h3 className={`mt-6 ${h2}`}>Holidays and exceptions</h3>
      <form className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); addEx.mutate(); }}>
        <input aria-label="Exception date" type="date" required className={input.replace('mt-1 ', '')} value={exDate} onChange={(e) => setExDate(e.target.value)} />
        <input aria-label="Exception name" required placeholder="Name" className={input.replace('mt-1 ', '')} value={exName} onChange={(e) => setExName(e.target.value)} />
        <select aria-label="Exception type" className={input.replace('mt-1 ', '')} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="HOLIDAY">Holiday</option>
          <option value="HALF_DAY">Half-day</option>
          <option value="WORKING_DAY">Exceptional working day</option>
        </select>
        <Button type="submit" disabled={addEx.isPending}>Add</Button>
      </form>
      {addEx.error ? <p className="mt-2 text-sm text-red-600">{errMsg(addEx.error)}</p> : null}
      <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <h4 className="text-sm font-semibold">Bulk import holidays</h4>
        <p className="mt-1 text-xs text-slate-500">Upload a text-based PDF or paste CSV rows as <code>YYYY-MM-DD, Holiday name, HOLIDAY</code>. Review and correct extracted rows before importing.</p>
        <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm font-medium dark:border-slate-700">{pdfImport.isPending ? 'Extracting PDF…' : 'Upload holiday PDF'}<input type="file" accept="application/pdf" className="sr-only" disabled={pdfImport.isPending} onChange={e=>{const f=e.target.files?.[0];if(f)pdfImport.mutate(f);e.currentTarget.value='';}} /></label>
        {pdfImport.error ? <p className="mt-2 text-sm text-red-600">{errMsg(pdfImport.error)}</p> : null}
        <textarea className={`${input} min-h-28`} value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder={'2026-10-20, Durga Puja, HOLIDAY\n2026-10-21, Vijaya Dashami, HOLIDAY'} />
        {bulkText && <p className="mt-2 text-xs text-slate-500">Preview: {bulkRows.length} valid row(s). Invalid lines are excluded.</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2"><select className="rounded border p-2 text-sm dark:bg-[#252525]" value={bulkMode} onChange={e=>setBulkMode(e.target.value as typeof bulkMode)}><option value="ADD_ONLY">Add only (skip existing dates)</option><option value="REPLACE_MATCHING">Replace matching dates</option></select><Button disabled={!bulkRows.length || bulk.isPending} onClick={()=>bulk.mutate()}>Import {bulkRows.length || ''} rows</Button></div>
        {bulk.error ? <p className="mt-2 text-sm text-red-600">{errMsg(bulk.error)}</p> : null}
      </div>
      <ul className="mt-3 space-y-2">
        {data.exceptions.length === 0 ? <li className="text-sm text-slate-400">No holidays or exceptions recorded.</li> : null}
        {data.exceptions.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-850">
            <span><b>{x.date}</b> · {x.name} <span className="text-slate-400">({x.kind.toLowerCase().replace('_', ' ')})</span></span>
            <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => removeEx.mutate(x.id)}>Remove</Button>
          </li>
        ))}
      </ul>

      <h3 className={`mt-6 ${h2}`}>Version history</h3>
      <ul className="mt-3 space-y-2">
        {history.length === 0 ? <li className="text-sm text-slate-400">No saved versions yet.</li> : null}
        {[...history].reverse().map((v) => (
          <li key={v.id} className="rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
            <div className="font-semibold text-slate-700 dark:text-slate-200">From {v.effectiveFrom} · {v.workdays.map((d) => DAYS[d]).join(' ')} · {toTime(v.startMinute)}–{toTime(v.endMinute)} · {v.unpaidBreakMinutes}m break</div>
            <div className="mt-0.5 text-slate-500">{v.changeReason}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface GroupRow { id: string; name: string; timezone: string; workdays: number[]; startMinute: number; endMinute: number; unpaidBreakMinutes: number; effectiveFrom: string; effectiveTo: string | null }
interface AssignmentRow { id: string; userId: string; effectiveFrom: string; effectiveTo: string | null }

function GroupAssignments({ group }: { group: GroupRow }) {
  const qc = useQueryClient();
  const { data: users = [] } = useUsers();
  const { data: rows = [] } = useQuery({ queryKey: ['schedule-group', group.id, 'assignments'], queryFn: () => http.get<AssignmentRow[]>(`/calendar/schedule-groups/${group.id}/assignments`) });
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const refresh = () => qc.invalidateQueries({ queryKey: ['schedule-group', group.id, 'assignments'] });
  const assign = useMutation({ mutationFn: () => http.post(`/calendar/schedule-groups/${group.id}/assignments`, { userId, effectiveFrom: from }), onSuccess: () => { setUserId(''); void refresh(); } });
  const unassign = useMutation({ mutationFn: (id: string) => http.del(`/calendar/schedule-groups/assignments/${id}`), onSuccess: () => void refresh() });
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Unknown person';
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <ul className="space-y-1">
        {rows.length === 0 ? <li className="text-xs text-slate-400">Nobody assigned.</li> : null}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
            <span>{nameOf(r.userId)} · from {r.effectiveFrom}{r.effectiveTo ? ` to ${r.effectiveTo}` : ''}</span>
            <button type="button" className="font-semibold text-red-600 hover:underline" onClick={() => unassign.mutate(r.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select aria-label={`Person for ${group.name}`} className={input.replace('mt-1 ', '')} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Assign a person…</option>
          {users.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input aria-label="Effective from" type="date" className={input.replace('mt-1 ', '')} value={from} onChange={(e) => setFrom(e.target.value)} />
        <Button disabled={!userId || assign.isPending} onClick={() => assign.mutate()}>Assign</Button>
      </div>
      {assign.error ? <p className="mt-1 text-xs text-red-600">{errMsg(assign.error)}</p> : null}
    </div>
  );
}

/** Schedule groups: different hours and breaks per team or person, effective-dated (spec section 2). */
export function ScheduleGroupsCard() {
  const qc = useQueryClient();
  const { data: groups = [] } = useQuery({ queryKey: ['schedule-groups'], queryFn: () => http.get<GroupRow[]>('/calendar/schedule-groups') });
  const { data: cal } = useCalendar();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [workdays, setWorkdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState(600);
  const [end, setEnd] = useState(1140);
  const [brk, setBrk] = useState(60);
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const create = useMutation({
    mutationFn: () => http.post('/calendar/schedule-groups', { name: name.trim(), timezone: cal?.settings.timezone ?? 'Asia/Kolkata', workdays, startMinute: start, endMinute: end, unpaidBreakMinutes: brk, effectiveFrom: from }),
    onSuccess: () => { setName(''); setAdding(false); void qc.invalidateQueries({ queryKey: ['schedule-groups'] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => http.del(`/calendar/schedule-groups/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['schedule-groups'] }) });
  const invalid = !name.trim() || end <= start + brk || workdays.length === 0;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className={h2}>Schedule groups</h2>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : 'New group'}</Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Hours and breaks are not assumed equal for everyone. People without a group use the organisation calendar.</p>
      {adding ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production early shift" /></label>
          <label className="text-sm">Start<input type="time" className={input} value={toTime(start)} onChange={(e) => setStart(fromTime(e.target.value))} /></label>
          <label className="text-sm">End<input type="time" className={input} value={toTime(end)} onChange={(e) => setEnd(fromTime(e.target.value))} /></label>
          <label className="text-sm">Unpaid break (minutes)<input type="number" min="0" className={input} value={brk} onChange={(e) => setBrk(Number(e.target.value))} /></label>
          <label className="text-sm">Effective from<input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <div className="text-sm sm:col-span-2"><span>Working days</span><WorkdayPicker value={workdays} onChange={setWorkdays} /></div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs text-slate-500">{invalid ? 'Name, at least one day and positive working time are required.' : hoursLabel(start, end, brk)}</p>
            <Button disabled={invalid || create.isPending} onClick={() => create.mutate()}>Create group</Button>
            {create.error ? <p className="mt-2 text-sm text-red-600">{errMsg(create.error)}</p> : null}
          </div>
        </div>
      ) : null}
      <ul className="mt-4 space-y-2">
        {groups.length === 0 ? <li className="text-sm text-slate-400">No schedule groups yet.</li> : null}
        {groups.map((g) => (
          <li key={g.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{g.name}</div>
                <div className="text-xs text-slate-500">{g.workdays.map((d) => DAYS[d]).join(' ')} · {toTime(g.startMinute)}–{toTime(g.endMinute)} · {g.unpaidBreakMinutes}m break · from {g.effectiveFrom}{g.effectiveTo ? ` to ${g.effectiveTo}` : ''}</div>
              </div>
              <div className="flex gap-3 text-xs font-semibold">
                <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? 'Hide people' : 'People'}</button>
                <button type="button" className="text-red-600 hover:underline" onClick={() => { if (window.confirm(`Delete "${g.name}"?`)) remove.mutate(g.id); }}>Delete</button>
              </div>
            </div>
            {open === g.id ? <GroupAssignments group={g} /> : null}
          </li>
        ))}
      </ul>
      {remove.error ? <p className="mt-2 text-sm text-red-600">{errMsg(remove.error)}</p> : null}
    </Card>
  );
}
