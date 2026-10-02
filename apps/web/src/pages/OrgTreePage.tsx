import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrgTree, OrgTreePerson, OrgTreePermissions, OrgTreeTeam } from '@task-tracker/shared';
import { ApiRequestError, http } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Avatar } from '../components/Avatar';
import { Button, Card, Input } from '../components/ui';
import { ChartFrame } from './OrgChartFrame';
import { PeopleChart } from './OrgPeopleChart';

/* Deep-green pulse for "you are here" and search hits. Static ring when the user prefers reduced motion. */
const PULSE_CSS = `
@keyframes orgPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(6,95,70,.65); } 50% { box-shadow: 0 0 0 7px rgba(6,95,70,0); } }
.org-hit { background:#065f46; color:#fff; border-color:#064e3b; animation: orgPulse 1.6s ease-in-out infinite; }
.org-hit .org-sub { color:#a7f3d0; }
.org-ring { box-shadow: 0 0 0 2px #065f46; animation: orgPulse 1.6s ease-in-out infinite; }
.org-node-hit { border-color:#065f46 !important; animation: orgPulse 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .org-hit { animation:none; box-shadow:0 0 0 3px rgba(6,95,70,.55); } .org-ring, .org-node-hit { animation:none; } .org-node-hit { box-shadow:0 0 0 3px rgba(6,95,70,.45); } }

/* Org chart: boxes joined by connector lines. */
.orgchart { --line:#94a3b8; --lineOn:#065f46; --gap:28px; }
.dark .orgchart { --line:#475569; --lineOn:#10b981; }
.orgchart ul { display:flex; justify-content:center; padding:var(--gap) 0 0; margin:0; list-style:none; position:relative; }
.orgchart li { display:flex; flex-direction:column; align-items:center; position:relative; padding:var(--gap) 10px 0; }
.orgchart li::before, .orgchart li::after { content:''; position:absolute; top:0; right:50%; width:50%; height:var(--gap); border-top:2px solid var(--line); }
.orgchart li::after { right:auto; left:50%; border-left:2px solid var(--line); }
.orgchart li:only-child { padding-top:0; }
.orgchart li:only-child::before, .orgchart li:only-child::after { display:none; }
.orgchart li:first-child::before, .orgchart li:last-child::after { border:0 none; }
.orgchart li:last-child::before { border-right:2px solid var(--line); border-radius:0 8px 0 0; }
.orgchart li:first-child::after { border-radius:8px 0 0 0; }
.orgchart ul ul::before { content:''; position:absolute; top:0; left:50%; height:var(--gap); border-left:2px solid var(--line); }
.orgchart li.on::before, .orgchart li.on::after, .orgchart li.on > ul::before { border-color:var(--lineOn); }
.orgchart > ul > li { padding-top:0; }
.orgchart > ul > li::before, .orgchart > ul > li::after { display:none; }
`;

type Ctx = {
  people: Map<string, OrgTreePerson>;
  teams: OrgTreeTeam[];
  children: Map<string | null, OrgTreeTeam[]>;
  me: string | undefined;
  found: Set<string>;
  trail: Set<string>;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  isAdmin: boolean;
  perm: OrgTreePermissions;
  /** Admin: any team. Manager: only teams they lead. */
  canEditTeam: (teamId: string) => boolean;
  editing: string | null;
  setEditing: (id: string | null) => void;
};

function PersonChip({ person, ctx, tag }: { person: OrgTreePerson; ctx: Ctx; tag?: string }) {
  const isMe = person.id === ctx.me;
  const isFound = ctx.found.has(person.id);
  const hit = isMe || isFound;
  return (
    <div
      data-person={person.id}
      data-hit={hit ? (isMe ? 'me' : 'found') : undefined}
      className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
        hit ? 'org-hit' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-[#222]'
      }`}
    >
      <Avatar user={person} size="sm" />
      <div className="min-w-0">
        <div className="truncate font-semibold leading-tight">
          {person.name}
          {isMe ? <span className="ml-1.5 rounded bg-white/20 px-1 text-[10px] font-bold uppercase">You</span> : null}
          {!isMe && isFound ? <span className="ml-1.5 rounded bg-white/20 px-1 text-[10px] font-bold uppercase">Found</span> : null}
        </div>
        {person.designation || tag ? (
          <div className="org-sub truncate text-xs text-slate-500 dark:text-slate-400">{[tag, person.designation].filter(Boolean).join(' · ')}</div>
        ) : null}
      </div>
    </div>
  );
}

function descendantIds(id: string, children: Ctx['children']): Set<string> {
  const out = new Set<string>();
  const walk = (t: string) => (children.get(t) ?? []).forEach((c) => { if (!out.has(c.id)) { out.add(c.id); walk(c.id); } });
  walk(id);
  return out;
}

function TeamEditor({ team, ctx, onDone }: { team: OrgTreeTeam; ctx: Ctx; onDone: () => void }) {
  const qc = useQueryClient();
  const [manager, setManager] = useState(team.managerId ?? '');
  const [parent, setParent] = useState(team.parentTeamId ?? '');
  const [members, setMembers] = useState(new Set(team.memberIds));
  const [error, setError] = useState<string | null>(null);
  
  const previousManager = useRef(manager);
  useEffect(() => {
    if (manager && manager !== previousManager.current) {
      const getDesc = (mId: string): string[] => {
        const direct = [...ctx.people.values()].filter((p) => p.reportsToId === mId).map((p) => p.id);
        return [...direct, ...direct.flatMap(getDesc)];
      };
      const descendants = getDesc(manager);
      if (descendants.length > 0) {
        setMembers((cur) => {
          const next = new Set(cur);
          next.add(manager);
          descendants.forEach((r) => next.add(r));
          return next;
        });
      }
    }
    previousManager.current = manager;
  }, [manager, ctx.people]);

  const blocked = useMemo(() => descendantIds(team.id, ctx.children), [team.id, ctx.children]);
  const save = useMutation({
    mutationFn: async () => {
      // Only an admin may change who leads a team or where it sits; a team's own manager edits its members.
      if (ctx.isAdmin) {
        await http.patch(`/organisation/teams/${team.id}`, { managerId: manager || null, parentTeamId: parent || null });
        await http.put(`/organisation/teams/${team.id}/members`, { userIds: [...members] });
      } else {
        await http.put(`/org-tree/teams/${team.id}/members`, { userIds: [...members] });
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['org-tree'] }); onDone(); },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not save'),
  });
  const allowed = new Set([...ctx.perm.manageablePersonIds, ...(ctx.me ? [ctx.me] : []), ...team.memberIds]);
  const people = [...ctx.people.values()].filter((p) => ctx.isAdmin || allowed.has(p.id));
  const sel = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-[#252525]';
  return (
    <div className="mt-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600" aria-label={`Edit ${team.name}`}>
      <div className={`grid gap-3 sm:grid-cols-2 ${ctx.isAdmin ? '' : 'hidden'}`}>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Manager
          <select aria-label="Team manager" className={`${sel} mt-1 font-normal normal-case tracking-normal`} value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">No manager</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Reports to team
          <select aria-label="Parent team" className={`${sel} mt-1 font-normal normal-case tracking-normal`} value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Top level</option>
            {ctx.teams.filter((t) => t.id !== team.id && !blocked.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Members</div>
      <div className="mt-1 grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={members.has(p.id)}
              onChange={(e) =>
                setMembers((cur) => {
                  const n = new Set(cur);
                  const getDesc = (mId: string): string[] => {
                    const direct = [...ctx.people.values()]
                      .filter((person) => person.reportsToId === mId)
                      .map((person) => person.id);
                    return [...direct, ...direct.flatMap(getDesc)];
                  };
                  const desc = getDesc(p.id);
                  if (e.target.checked) {
                    n.add(p.id);
                    desc.forEach((d) => n.add(d));
                  } else {
                    n.delete(p.id);
                    desc.forEach((d) => n.delete(d));
                  }
                  return n;
                })
              }
            />
            <span className="truncate">{p.name}</span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save team'}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function TeamNode({ team, ctx, depth }: { team: OrgTreeTeam; ctx: Ctx; depth: number }) {
  const kids = ctx.children.get(team.id) ?? [];
  const open = !ctx.collapsed.has(team.id);
  const onTrail = ctx.trail.has(team.id);
  const manager = team.managerId ? ctx.people.get(team.managerId) : undefined;
  const members = team.memberIds.filter((id) => id !== team.managerId).map((id) => ctx.people.get(id)).filter((p): p is OrgTreePerson => !!p);
  return (
    <li data-team={team.id} data-trail={onTrail ? 'true' : undefined} className="relative">
      <div className={`rounded-xl border p-3 ${onTrail ? 'border-emerald-700 bg-emerald-50/70 dark:border-emerald-600 dark:bg-emerald-950/30' : 'border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-[#1c1c1c]'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => ctx.toggle(team.id)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${team.name}`}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-xs font-bold dark:border-slate-600"
          >
            {open ? '−' : '+'}
          </button>
          <h3 className="text-base font-extrabold">{team.name}</h3>
          <span className="text-xs text-slate-500">{members.length + (manager ? 1 : 0)} {members.length + (manager ? 1 : 0) === 1 ? 'person' : 'people'}{kids.length ? ` · ${kids.length} sub-team${kids.length > 1 ? 's' : ''}` : ''}</span>
          {ctx.canEditTeam(team.id) ? (
            <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={() => ctx.setEditing(ctx.editing === team.id ? null : team.id)}>
              {ctx.editing === team.id ? 'Close' : 'Edit'}
            </Button>
          ) : null}
        </div>
        {ctx.editing === team.id ? <TeamEditor key={team.id} team={team} ctx={ctx} onDone={() => ctx.setEditing(null)} /> : null}
        {open ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {manager ? <PersonChip person={manager} ctx={ctx} tag="Manager" /> : <div className="rounded-lg border border-dashed border-amber-400 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">No manager assigned</div>}
              {members.map((p) => <PersonChip key={p.id} person={p} ctx={ctx} />)}
            </div>
            {kids.length ? (
              <ul className="mt-3 space-y-3 border-l-2 border-slate-300 pl-3 sm:pl-5 dark:border-slate-600" style={{ marginLeft: depth === 0 ? 4 : 0 }}>
                {kids.map((k) => <TeamNode key={k.id} team={k} ctx={ctx} depth={depth + 1} />)}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}


const MAX_STACK = 5;

function ChartNode({ team, ctx, selected, onSelect }: { team: OrgTreeTeam; ctx: Ctx; selected: boolean; onSelect: () => void }) {
  const kids = ctx.children.get(team.id) ?? [];
  const open = !ctx.collapsed.has(team.id);
  const manager = team.managerId ? ctx.people.get(team.managerId) : undefined;
  const people = team.memberIds.filter((id) => id !== team.managerId).map((id) => ctx.people.get(id)).filter((p): p is OrgTreePerson => !!p);
  const hasMe = !!ctx.me && (team.managerId === ctx.me || team.memberIds.includes(ctx.me));
  const hasFound = team.memberIds.some((m) => ctx.found.has(m)) || (!!team.managerId && ctx.found.has(team.managerId));
  const hit = hasMe || hasFound;
  const stack = [...people].sort((a, b) => Number(ctx.found.has(b.id) || b.id === ctx.me) - Number(ctx.found.has(a.id) || a.id === ctx.me));
  const total = people.length + (manager ? 1 : 0);
  return (
    <div className="flex flex-col items-center">
      <div
        data-node={team.id}
        data-node-me={hasMe ? 'true' : undefined}
        data-node-hit={hit ? 'true' : undefined}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${team.name}, ${total} ${total === 1 ? 'person' : 'people'}`}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
        className={`w-[220px] cursor-pointer rounded-xl border-2 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-[#1e1e1e] ${
          hit ? 'org-node-hit' : selected ? 'border-indigo-500' : 'border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-extrabold leading-snug">{team.name}</h3>
          {hasMe ? <span className="shrink-0 rounded bg-emerald-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">You</span> : hasFound ? <span className="shrink-0 rounded bg-emerald-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Match</span> : null}
        </div>
        <div className="mt-2">
          {manager ? (
            <div className="flex items-center gap-2">
              <Avatar user={manager} size="md" className={manager.id === ctx.me || ctx.found.has(manager.id) ? 'org-ring' : ''} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-tight">{manager.name}</div>
                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">Manager{manager.designation ? ` · ${manager.designation}` : ''}</div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-amber-400 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">No manager assigned</div>
          )}
        </div>
        {people.length ? (
          <div className="mt-2.5 flex items-center">
            <div className="flex -space-x-1.5">
              {stack.slice(0, MAX_STACK).map((m) => (
                <Avatar key={m.id} user={m} size="sm" className={`ring-2 ring-white dark:ring-[#1e1e1e] ${m.id === ctx.me || ctx.found.has(m.id) ? 'org-ring !ring-emerald-700' : ''}`} />
              ))}
            </div>
            {people.length > MAX_STACK ? <span className="ml-1.5 text-xs font-semibold text-slate-500">+{people.length - MAX_STACK}</span> : null}
            <span className="ml-auto text-[11px] text-slate-500">{people.length} {people.length === 1 ? 'member' : 'members'}</span>
          </div>
        ) : null}
      </div>
      {kids.length ? (
        <button
          type="button"
          onClick={() => ctx.toggle(team.id)}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${team.name} sub-teams`}
          className="relative z-10 -mb-1 mt-1.5 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#222] dark:text-slate-300"
        >
          {open ? '−' : '+'} {kids.length}
        </button>
      ) : null}
    </div>
  );
}

function ChartBranch({ team, ctx, selectedId, onSelect }: { team: OrgTreeTeam; ctx: Ctx; selectedId: string | null; onSelect: (id: string) => void }) {
  const kids = ctx.children.get(team.id) ?? [];
  const open = !ctx.collapsed.has(team.id);
  return (
    <li className={ctx.trail.has(team.id) ? 'on' : undefined}>
      <ChartNode team={team} ctx={ctx} selected={selectedId === team.id} onSelect={() => onSelect(team.id)} />
      {kids.length && open ? (
        <ul>{kids.map((k) => <ChartBranch key={k.id} team={k} ctx={ctx} selectedId={selectedId} onSelect={onSelect} />)}</ul>
      ) : null}
    </li>
  );
}

function DetailPanel({ team, ctx, onClose }: { team: OrgTreeTeam; ctx: Ctx; onClose: () => void }) {
  const manager = team.managerId ? ctx.people.get(team.managerId) : undefined;
  const members = team.memberIds.filter((id) => id !== team.managerId).map((id) => ctx.people.get(id)).filter((p): p is OrgTreePerson => !!p);
  const parent = ctx.teams.find((t) => t.id === team.parentTeamId);
  const subs = ctx.children.get(team.id) ?? [];
  return (
    <aside aria-label={`${team.name} details`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#1e1e1e]">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-extrabold leading-snug">{team.name}</h2>
          <p className="text-xs text-slate-500">{parent ? `Reports to ${parent.name}` : 'Top-level team'}{subs.length ? ` · ${subs.length} sub-team${subs.length > 1 ? 's' : ''}` : ''}</p>
        </div>
        <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={onClose} aria-label="Close details">Close</Button>
      </div>
      <div className="mt-3 grid gap-2">
        {manager ? <PersonChip person={manager} ctx={ctx} tag="Manager" /> : <div className="rounded-lg border border-dashed border-amber-400 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">No manager assigned</div>}
        {members.map((p) => <PersonChip key={p.id} person={p} ctx={ctx} />)}
        {!members.length && !manager ? <p className="text-sm text-slate-500">Nobody is in this team yet.</p> : null}
      </div>
      {ctx.canEditTeam(team.id) ? (
        <div className="mt-3">
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => ctx.setEditing(ctx.editing === team.id ? null : team.id)}>{ctx.editing === team.id ? 'Close editor' : ctx.isAdmin ? 'Edit team' : 'Edit my team'}</Button>
          {ctx.editing === team.id ? <TeamEditor key={team.id} team={team} ctx={ctx} onDone={() => ctx.setEditing(null)} /> : null}
        </div>
      ) : null}
    </aside>
  );
}

function ChartView({ ctx, roots, unassigned, peopleCount, teamCount, scrollKey }: { ctx: Ctx; roots: OrgTreeTeam[]; unassigned: OrgTreePerson[]; peopleCount: number; teamCount: number; scrollKey: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ctx.teams.find((t) => t.id === selectedId) ?? null;
  const [showAllPeople, setShowAllPeople] = useState(false);
  const shownUnassigned = showAllPeople ? unassigned : unassigned.slice(0, 12);

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <ChartFrame
          ready={roots.length > 0}
          scrollKey={scrollKey}
          heading={
            <>
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-extrabold text-white dark:bg-white dark:text-slate-900">Studio 1947</span>
              <span>{peopleCount} people · {teamCount} teams</span>
            </>
          }
        >
          <ul>
            <li>
              <div className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-extrabold text-white shadow dark:bg-white dark:text-slate-900">Studio 1947</div>
              {roots.length ? <ul>{roots.map((t) => <ChartBranch key={t.id} team={t} ctx={ctx} selectedId={selectedId} onSelect={setSelectedId} />)}</ul> : null}
            </li>
          </ul>
        </ChartFrame>
        {!roots.length ? <p className="mt-3 text-sm text-slate-500">{ctx.isAdmin ? 'No teams yet. Add one above.' : 'No teams have been set up yet.'}</p> : null}
        <p className="mt-2 text-xs text-slate-500">Drag to move around, use the zoom buttons or scroll. Select a team for its people.</p>
        {unassigned.length ? (
          <div className="mt-4" data-unassigned>
            <h3 className="text-sm font-extrabold">Not in a team <span className="font-normal text-slate-500">({unassigned.length})</span></h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {shownUnassigned.map((p) => <PersonChip key={p.id} person={p} ctx={ctx} />)}
            </div>
            {unassigned.length > 12 ? (
              <Button variant="ghost" className="mt-2 px-3 py-1.5 text-xs" onClick={() => setShowAllPeople((v) => !v)}>
                {showAllPeople ? 'Show fewer' : `Show all ${unassigned.length}`}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        {selected ? (
          <DetailPanel team={selected} ctx={ctx} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">Select a team in the chart to see its manager and members{ctx.perm.level !== 'VIEWER' ? ' and edit the ones you lead' : ''}.</div>
        )}
      </div>
    </div>
  );
}

export function OrgTreePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['org-tree'], queryFn: () => http.get<OrgTree>('/org-tree') });
  const perm: OrgTreePermissions = data?.permissions ?? { level: 'VIEWER', manageablePersonIds: [], manageableTeamIds: [], canPlaceTopLevel: false, canCreatePeople: false };
  const isAdmin = perm.level === 'ADMIN';
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  type View = 'people' | 'teams' | 'list';
  const [view, setViewState] = useState<View>(() => {
    try {
      const saved = localStorage.getItem('orgTreeView2');
      return saved === 'teams' || saved === 'list' ? saved : 'people';
    } catch { return 'people'; }
  });
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem('orgTreeView2', v); } catch { /* optional */ } };

  const addTeam = useMutation({
    mutationFn: () => http.post('/organisation/teams', { name: newTeam.trim() }),
    onSuccess: () => { setNewTeam(''); setAddError(null); void qc.invalidateQueries({ queryKey: ['org-tree'] }); },
    onError: (e) => setAddError(e instanceof ApiRequestError ? e.message : 'Could not add the team'),
  });

  const model = useMemo(() => {
    const teams = data?.teams ?? [];
    const people = new Map((data?.people ?? []).map((p) => [p.id, p]));
    const children = new Map<string | null, OrgTreeTeam[]>();
    for (const t of teams) children.set(t.parentTeamId, [...(children.get(t.parentTeamId) ?? []), t]);
    const q = query.trim().toLowerCase();
    const found = new Set<string>();
    if (q.length >= 2) for (const p of people.values()) if (p.name.toLowerCase().includes(q) && p.id !== user?.id) found.add(p.id);
    // Teams that contain a highlighted person, plus every ancestor, form the trail.
    const marked = new Set<string>([...found, ...(user?.id ? [user.id] : [])]);
    const parentOf = new Map(teams.map((t) => [t.id, t.parentTeamId]));
    const trail = new Set<string>();
    for (const t of teams) {
      if (t.managerId && marked.has(t.managerId) || t.memberIds.some((m) => marked.has(m))) {
        for (let cur: string | null = t.id, hops = 0; cur && !trail.has(cur) && hops < 50; cur = parentOf.get(cur) ?? null, hops += 1) trail.add(cur);
      }
    }
    const placed = new Set<string>();
    for (const t of teams) { if (t.managerId) placed.add(t.managerId); t.memberIds.forEach((m) => placed.add(m)); }
    const unassigned = [...people.values()].filter((p) => !placed.has(p.id));
    return { teams, people, children, found, trail, unassigned };
  }, [data, query, user?.id]);

  // A searched person is brought into view (opening any collapsed branch above them).
  useEffect(() => {
    if (model.found.size === 0) return;
    setCollapsed((cur) => (cur.size ? new Set([...cur].filter((id) => !model.trail.has(id))) : cur));
    if (view !== 'list') return;
    const t = setTimeout(() => {
      const first = [...model.found][0];
      rootRef.current?.querySelector(`[data-person="${first}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [model.found, model.trail, view]);

  const ctx: Ctx = {
    people: model.people,
    teams: model.teams,
    children: model.children,
    me: user?.id,
    found: model.found,
    trail: model.trail,
    collapsed,
    toggle: (id) => setCollapsed((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    isAdmin,
    perm,
    canEditTeam: (id) => isAdmin || perm.manageableTeamIds.includes(id),
    editing,
    setEditing,
  };

  const roots = model.children.get(null) ?? [];
  const myTeams = model.teams.filter((t) => t.managerId === user?.id || (user?.id ? t.memberIds.includes(user.id) : false));
  const meName = user ? model.people.get(user.id) : undefined;

  return (
    <div ref={rootRef}>
      <style>{PULSE_CSS}</style>
      <h1 className="text-2xl font-extrabold">Org tree</h1>
      <p className="mt-1 text-sm text-slate-500">
        Teams, who leads them and who is in them. {meName ? (myTeams.length ? <>You are highlighted in <strong>{myTeams.map((t) => t.name).join(', ')}</strong>.</> : 'You are not in a team yet.') : null}
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input aria-label="Find a person" placeholder="Find a person…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs" />
        {query.trim().length >= 2 ? <span className="text-sm text-slate-500" role="status">{model.found.size} found</span> : null}
        <div className="flex gap-2 sm:ml-auto">
          <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" role="group" aria-label="View">
            {(['people', 'teams', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-sm font-semibold capitalize ${view === v ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 dark:bg-[#1e1e1e] dark:text-slate-300'}`}
              >
                {v}
              </button>
            ))}
          </div>
          {view === 'list' ? (
            <>
              <Button variant="ghost" onClick={() => setCollapsed(new Set())}>Expand all</Button>
              <Button variant="ghost" onClick={() => setCollapsed(new Set(model.teams.map((t) => t.id)))}>Collapse all</Button>
            </>
          ) : null}
        </div>
      </div>

      {isAdmin && view !== 'people' ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input aria-label="New team name" placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} className="sm:max-w-xs" />
          <Button onClick={() => addTeam.mutate()} disabled={!newTeam.trim() || addTeam.isPending}>Add team</Button>
          {addError ? <span className="text-sm font-medium text-red-600">{addError}</span> : null}
        </div>
      ) : null}

      {isLoading ? <p className="mt-6 text-sm text-slate-500">Loading the org tree…</p> : null}
      {error ? <p className="mt-6 text-sm font-medium text-red-600">Could not load the org tree.</p> : null}

      {data && view === 'people' ? (
        <PeopleChart tree={data} me={user?.id} found={model.found} scrollKey={[...model.found].join(',')} />
      ) : null}

      {data && view === 'teams' ? (
        <ChartView
          ctx={ctx}
          roots={roots}
          unassigned={model.unassigned}
          peopleCount={model.people.size}
          teamCount={model.teams.length}
          scrollKey={[...model.found].join(',')}
        />
      ) : null}

      {data && view === 'list' ? (
        <Card className="mt-5 p-4 sm:p-5">
          <div className="flex items-center gap-2 pb-3">
            <span className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-extrabold text-white dark:bg-white dark:text-slate-900">Studio 1947</span>
            <span className="text-xs text-slate-500">{model.people.size} people · {model.teams.length} teams</span>
          </div>
          {roots.length ? (
            <ul className="space-y-3 border-l-2 border-slate-300 pl-3 sm:pl-5 dark:border-slate-600">
              {roots.map((t) => <TeamNode key={t.id} team={t} ctx={ctx} depth={0} />)}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{isAdmin ? 'No teams yet. Add one above.' : 'No teams have been set up yet.'}</p>
          )}
          {model.unassigned.length ? (
            <div className="mt-5" data-unassigned>
              <h3 className="text-sm font-extrabold">Not in a team <span className="font-normal text-slate-500">({model.unassigned.length})</span></h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {model.unassigned.map((p) => <PersonChip key={p.id} person={p} ctx={ctx} />)}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
