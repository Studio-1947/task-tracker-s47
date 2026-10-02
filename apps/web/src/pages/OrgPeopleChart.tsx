import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrgTree, OrgTreePerson } from '@task-tracker/shared';
import { ApiRequestError, http } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { Button, Input } from '../components/ui';
import { SearchableSelect, type SelectOption } from '../components/SearchableSelect';
import { ChartFrame } from './OrgChartFrame';

type Msg = { kind: 'ok' | 'err'; text: string } | null;

/**
 * The reporting chart: CEO at the top, managers below, staff below them.
 * Admin can drag anyone anywhere; a manager only people below them, and only to a place below them.
 * The server enforces all of it (see OrganisationService.movePerson); this screen only mirrors `permissions`.
 */
export function PeopleChart({
  tree,
  me,
  found,
  scrollKey,
}: {
  tree: OrgTree;
  me: string | undefined;
  found: Set<string>;
  scrollKey: string;
}) {
  const qc = useQueryClient();
  const perm = tree.permissions;
  const canEdit = perm.level !== 'VIEWER';
  const isAdmin = perm.level === 'ADMIN';
  const manageable = useMemo(() => new Set(perm.manageablePersonIds), [perm.manageablePersonIds]);

  // Editing is on by default for anyone who can edit (admin, or a manager for their own team). The button only hides the controls.
  const [editMode, setEditMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // The browser decides whether a drop is allowed on the very first dragover, before React re-renders. Judge from a ref, show from state.
  const dragRef = useRef<string | null>(null);
  const startDrag = (id: string, e: React.DragEvent) => {
    dragRef.current = id;
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragId(null);
  };
  const acceptsDrop = (to: string | null) =>
    editMode && dragRef.current !== null && canDrop(dragRef.current, to);
  const [msg, setMsg] = useState<Msg>(null);
  const [showAllUnplaced, setShowAllUnplaced] = useState(false);
  // The simple way to edit: pick a person, pick who they report to, press Place. Dragging is the optional shortcut.
  const [placeWho, setPlaceWho] = useState('');
  const [placeUnder, setPlaceUnder] = useState<string | null>(null); // null = not chosen yet, '' = top of the chart

  const model = useMemo(() => {
    const byId = new Map(tree.people.map((p) => [p.id, p]));
    const children = new Map<string, OrgTreePerson[]>();
    for (const p of tree.people)
      if (p.reportsToId && byId.has(p.reportsToId))
        children.set(p.reportsToId, [...(children.get(p.reportsToId) ?? []), p]);
    const roots = tree.people.filter(
      (p) => !p.reportsToId && (p.isTop || (children.get(p.id)?.length ?? 0) > 0),
    );
    const unplaced = tree.people.filter(
      (p) => !p.reportsToId && !p.isTop && !children.get(p.id)?.length,
    );
    // People above anyone highlighted form the green trail.
    const trail = new Set<string>();
    for (const start of [...found, ...(me ? [me] : [])]) {
      for (
        let cur = byId.get(start)?.reportsToId ?? null, hops = 0;
        cur && !trail.has(cur) && hops < 50;
        cur = byId.get(cur)?.reportsToId ?? null, hops += 1
      )
        trail.add(cur);
    }
    return { byId, children, roots, unplaced, trail };
  }, [tree.people, found, me]);

  const descendants = (id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (x: string) =>
      (model.children.get(x) ?? []).forEach((c) => {
        if (!out.has(c.id)) {
          out.add(c.id);
          walk(c.id);
        }
      });
    walk(id);
    return out;
  };

  /** Mirrors the server rule; the server has the final say. `to === null` means "top of the chart". */
  const canDrop = (id: string, to: string | null): boolean => {
    const person = model.byId.get(id);
    if (!person || !manageable.has(id)) return false;
    if (to === null) return isAdmin && (person.reportsToId !== null || !person.isTop);
    if (to === id || person.reportsToId === to) return false;
    if (descendants(id).has(to)) return false;
    return isAdmin || to === me || manageable.has(to);
  };

  const move = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string | null }) =>
      http.patch(`/org-tree/people/${id}`, { reportsToId: to }),
    onSuccess: (_d, v) => {
      const who = model.byId.get(v.id)?.name ?? 'Person';
      const where = v.to ? (model.byId.get(v.to)?.name ?? 'their manager') : 'the top of the chart';
      setMsg({ kind: 'ok', text: `${who} now reports to ${where}.` });
      if (v.to)
        setCollapsed((c) => {
          const n = new Set(c);
          n.delete(v.to!);
          return n;
        });
      void qc.invalidateQueries({ queryKey: ['org-tree'] });
    },
    onError: (e) =>
      setMsg({
        kind: 'err',
        text: e instanceof ApiRequestError ? e.message : 'Could not move that person',
      }),
  });

  const rename = useMutation({
    mutationFn: ({ id, designation }: { id: string; designation: string }) =>
      http.patch(`/org-tree/people/${id}`, { designation }),
    onSuccess: () => {
      setMsg({ kind: 'ok', text: 'Title saved.' });
      void qc.invalidateQueries({ queryKey: ['org-tree'] });
    },
    onError: (e) =>
      setMsg({
        kind: 'err',
        text: e instanceof ApiRequestError ? e.message : 'Could not save the title',
      }),
  });

  const drop = (to: string | null) => {
    const id = dragRef.current;
    if (id && canDrop(id, to)) move.mutate({ id, to });
    endDrag();
  };

  const selected = selectedId ? (model.byId.get(selectedId) ?? null) : null;
  const chartIsEmpty = model.roots.length === 0;
  useEffect(() => {
    let hidden = false;
    try {
      hidden = localStorage.getItem('orgEditHidden') === '1';
    } catch {
      /* optional */
    }
    if (canEdit && (!hidden || (isAdmin && chartIsEmpty))) setEditMode(true);
  }, [canEdit, isAdmin, chartIsEmpty]);
  const toggleEdit = () => {
    const next = !editMode;
    setEditMode(next);
    setMsg(null);
    try {
      if (next) localStorage.removeItem('orgEditHidden');
      else localStorage.setItem('orgEditHidden', '1');
    } catch {
      /* optional */
    }
  };

  /** Who may be placed (everyone for an admin, only your own people for a manager) and under whom. */
  const personOptions: SelectOption[] = useMemo(
    () =>
      tree.people
        .filter((p) => isAdmin || manageable.has(p.id))
        .map((p) => ({
          value: p.id,
          label: p.name,
          hint:
            p.designation ??
            (p.reportsToId
              ? `under ${model.byId.get(p.reportsToId)?.name ?? '…'}`
              : p.isTop
                ? 'top of chart'
                : 'not on the chart yet'),
        })),
    [tree.people, isAdmin, manageable, model.byId],
  );
  const underOptions: SelectOption[] = useMemo(() => {
    const blocked = placeWho ? descendants(placeWho) : new Set<string>();
    return tree.people
      .filter(
        (p) =>
          p.id !== placeWho &&
          !blocked.has(p.id) &&
          (isAdmin || p.id === me || manageable.has(p.id)),
      )
      .map((p) => ({ value: p.id, label: p.name, hint: p.designation ?? undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.people, placeWho, isAdmin, me, manageable, model.children]);
  const placeReady =
    !!placeWho &&
    placeUnder !== null &&
    (placeUnder !== '' ? canDrop(placeWho, placeUnder) : canDrop(placeWho, null));
  const doPlace = () => {
    if (!placeReady) return;
    move.mutate(
      { id: placeWho, to: placeUnder === '' ? null : placeUnder },
      {
        onSuccess: () => {
          setPlaceWho('');
          setPlaceUnder(null);
        },
      },
    );
  };

  // Plain render functions, not components: a component defined here would remount on every render and cancel an in-flight drag.
  const renderNode = (p: OrgTreePerson) => {
    const kids = model.children.get(p.id) ?? [];
    const open = !collapsed.has(p.id);
    const isMe = p.id === me;
    const isFound = found.has(p.id);
    const hit = isMe || isFound;
    const draggable = editMode && manageable.has(p.id);
    const target = dragId !== null && editMode;
    const valid = target && canDrop(dragId!, p.id);
    const teamNames = tree.teams
      .filter((team) => team.memberIds.includes(p.id) || team.managerId === p.id)
      .map((team) => `${team.name}${team.managerId === p.id ? ' — Manager' : ''}`);
    return (
      <div className="flex flex-col items-center">
        <div
          data-node={p.id}
          data-node-me={isMe ? 'true' : undefined}
          data-node-hit={hit ? 'true' : undefined}
          data-draggable={draggable ? 'true' : undefined}
          role="button"
          tabIndex={0}
          aria-pressed={selectedId === p.id}
          aria-label={`${p.name}${p.designation ? `, ${p.designation}` : ''}${kids.length ? `, ${kids.length} direct reports` : ''}`}
          draggable={draggable}
          onDragStart={(e) => startDrag(p.id, e)}
          onDragEnd={endDrag}
          onDragOver={(e) => {
            if (acceptsDrop(p.id)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={(e) => {
            if (acceptsDrop(p.id)) {
              e.preventDefault();
              drop(p.id);
            }
          }}
          onClick={() => setSelectedId(p.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedId(p.id);
            }
          }}
          className={`w-[200px] rounded-xl border-2 bg-white p-2.5 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-[#1e1e1e] ${
            draggable ? 'cursor-move' : 'cursor-pointer'
          } ${hit ? 'org-node-hit' : selectedId === p.id ? 'border-indigo-500' : 'border-slate-200 dark:border-slate-700'} ${
            valid
              ? '!border-dashed !border-emerald-500 ring-2 ring-emerald-400/60'
              : target && dragId !== p.id
                ? 'opacity-60'
                : ''
          } ${dragId === p.id ? 'opacity-40' : ''}`}
        >
          <div className="flex items-center gap-2">
            <Avatar user={p} size="md" className={hit ? 'org-ring' : ''} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-extrabold leading-tight">{p.name}</span>
                {isMe ? (
                  <span className="shrink-0 rounded bg-emerald-800 px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                    You
                  </span>
                ) : isFound ? (
                  <span className="shrink-0 rounded bg-emerald-800 px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                    Match
                  </span>
                ) : null}
              </div>
              <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {p.designation ?? (kids.length ? 'Manager' : 'Team member')}
              </div>
              <div
                className="mt-0.5 truncate text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
                title={teamNames.join(', ')}
              >
                {teamNames.length ? `Teams: ${teamNames.join(', ')}` : 'No team assigned'}
              </div>
            </div>
          </div>
          {draggable ? (
            <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              ⠿ drag to move
            </div>
          ) : null}
        </div>
        {editMode && (isAdmin || p.id === me || manageable.has(p.id)) ? (
          <button
            type="button"
            data-place-under={p.id}
            onClick={() => {
              setPlaceUnder(p.id);
              setMsg(null);
              document
                .getElementById('org-place-bar')
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }}
            className="mt-1.5 rounded-full border border-emerald-600/50 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200"
          >
            + Place under {p.name.split(' ')[0]}
          </button>
        ) : null}
        {kids.length ? (
          <button
            type="button"
            onClick={() =>
              setCollapsed((c) => {
                const n = new Set(c);
                if (n.has(p.id)) n.delete(p.id);
                else n.add(p.id);
                return n;
              })
            }
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${p.name}'s reports`}
            className="relative z-10 -mb-1 mt-1.5 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#222] dark:text-slate-300"
          >
            {open ? '−' : '+'} {kids.length}
          </button>
        ) : null}
      </div>
    );
  };

  const renderBranch = (p: OrgTreePerson): ReactElement => {
    const kids = model.children.get(p.id) ?? [];
    const open = !collapsed.has(p.id);
    return (
      <li key={p.id} className={model.trail.has(p.id) ? 'on' : undefined}>
        {renderNode(p)}
        {kids.length && open ? <ul>{kids.map((k) => renderBranch(k))}</ul> : null}
      </li>
    );
  };

  const rootDrop = dragId !== null && editMode && canDrop(dragId, null);
  const shownUnplaced = showAllUnplaced ? model.unplaced : model.unplaced.slice(0, 12);

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {msg ? (
          <p
            role="status"
            className={`mb-2 rounded-lg px-3 py-2 text-sm font-medium ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}
          >
            {msg.text}
          </p>
        ) : null}
        {editMode ? (
          chartIsEmpty && isAdmin ? (
            <div
              id="org-place-bar"
              data-start-card
              className="mb-3 rounded-xl border-2 border-emerald-600/50 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/20"
            >
              <h2 className="text-base font-extrabold">Start with the person at the top</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Pick your CEO. After that, use "Place under" to add managers, then their teams.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:w-72">
                  <SearchableSelect
                    ariaLabel="Person at the top"
                    options={personOptions}
                    value={placeWho}
                    onChange={setPlaceWho}
                    placeholder="Search for the CEO…"
                  />
                </div>
                <Button
                  disabled={!placeWho || move.isPending}
                  onClick={() =>
                    move.mutate({ id: placeWho, to: null }, { onSuccess: () => setPlaceWho('') })
                  }
                >
                  Set as CEO
                </Button>
              </div>
            </div>
          ) : (
            <div
              id="org-place-bar"
              data-place-bar
              className="mb-3 rounded-xl border border-emerald-600/40 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-950/20"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Place someone in the chart
              </div>
              <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="min-w-0 lg:w-60">
                  <SearchableSelect
                    ariaLabel="Person to place"
                    options={personOptions}
                    value={placeWho}
                    onChange={(v) => {
                      setPlaceWho(v);
                      setMsg(null);
                    }}
                    placeholder="1. Who?"
                  />
                </div>
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  reports to
                </span>
                <div className="min-w-0 lg:w-60">
                  <SearchableSelect
                    ariaLabel="Reports to"
                    options={underOptions}
                    value={placeUnder ?? ''}
                    onChange={(v) => {
                      setPlaceUnder(v);
                      setMsg(null);
                    }}
                    emptyLabel={isAdmin ? 'Top of the chart (CEO)' : undefined}
                    placeholder="2. Which manager?"
                  />
                </div>
                <Button data-place-go disabled={!placeReady || move.isPending} onClick={doPlace}>
                  {move.isPending ? 'Placing…' : '3. Place'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Or press "+ Place under …" on any box, or drag a person onto their manager.
                {isAdmin ? '' : ' You can place people from your own team.'}
              </p>
            </div>
          )
        ) : null}
        <ChartFrame
          ready={model.roots.length > 0}
          scrollKey={scrollKey}
          heading={
            <>
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-extrabold text-white dark:bg-white dark:text-slate-900">
                Reporting chart
              </span>
              <span>{tree.people.length} people</span>
              {canEdit ? (
                <Button
                  variant={editMode ? 'ghost' : 'primary'}
                  className="px-3 py-1 text-xs"
                  aria-pressed={editMode}
                  onClick={toggleEdit}
                >
                  {editMode ? 'Hide editing' : isAdmin ? '✎ Edit chart' : '✎ Edit my team'}
                </Button>
              ) : null}
            </>
          }
          extraControls={
            <>
              <Button
                variant="ghost"
                className="px-2.5 py-1 text-xs"
                onClick={() => setCollapsed(new Set())}
              >
                Expand all
              </Button>
              <Button
                variant="ghost"
                className="px-2.5 py-1 text-xs"
                onClick={() => setCollapsed(new Set([...model.children.keys()]))}
              >
                Collapse all
              </Button>
            </>
          }
        >
          <ul>
            <li>
              <div
                data-company
                onDragOver={(e) => {
                  if (acceptsDrop(null)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  if (acceptsDrop(null)) {
                    e.preventDefault();
                    drop(null);
                  }
                }}
                className={`relative rounded-xl px-5 py-2.5 text-sm font-extrabold shadow ${rootDrop ? 'bg-emerald-700 text-white ring-2 ring-emerald-400' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'}`}
              >
                Studio 1947
                {/* Floating, so it never changes the box size: a reflow mid-drag would slide every target out from under the cursor. */}
                {rootDrop ? (
                  <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    Drop here for the top of the chart
                  </span>
                ) : null}
              </div>
              {model.roots.length ? <ul>{model.roots.map((r) => renderBranch(r))}</ul> : null}
            </li>
          </ul>
        </ChartFrame>
        {!model.roots.length ? (
          <p className="mt-3 text-sm text-slate-500">
            {isAdmin
              ? 'The chart is empty. Pick the person at the top above, then place everyone else under them.'
              : 'The reporting chart has not been set up yet.'}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          {editMode
            ? isAdmin
              ? 'Drag a person onto their new manager. Valid targets glow green.'
              : 'Drag someone in your team onto a new manager inside your team. Valid targets glow green.'
            : 'Drag the background to move around. Select a person to see who they manage.'}
        </p>
        {model.unplaced.length ? (
          <div className="mt-4" data-unplaced>
            <h3 className="text-sm font-extrabold">
              Not in the chart yet{' '}
              <span className="font-normal text-slate-500">({model.unplaced.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              No manager and nobody reporting to them.
              {isAdmin && editMode ? ' Click a name to place them with the form above.' : ''}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {shownUnplaced.map((p) => {
                const hit = p.id === me || found.has(p.id);
                const draggable = editMode && manageable.has(p.id);
                return (
                  <div
                    key={p.id}
                    data-person={p.id}
                    data-node-hit={hit ? 'true' : undefined}
                    draggable={draggable}
                    onDragStart={(e) => startDrag(p.id, e)}
                    onDragEnd={endDrag}
                    onClick={() => {
                      setSelectedId(p.id);
                      if (editMode && manageable.has(p.id)) {
                        setPlaceWho(p.id);
                        document
                          .getElementById('org-place-bar')
                          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      }
                    }}
                    className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${hit ? 'org-hit' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-[#222]'} ${draggable ? 'cursor-move' : ''}`}
                  >
                    <Avatar user={p} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold leading-tight">{p.name}</div>
                      {p.designation ? (
                        <div className="org-sub truncate text-xs text-slate-500 dark:text-slate-400">
                          {p.designation}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {model.unplaced.length > 12 ? (
              <Button
                variant="ghost"
                className="mt-2 px-3 py-1.5 text-xs"
                onClick={() => setShowAllUnplaced((v) => !v)}
              >
                {showAllUnplaced ? 'Show fewer' : `Show all ${model.unplaced.length}`}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        {selected ? (
          <PersonPanel
            key={selected.id}
            person={selected}
            tree={tree}
            model={model}
            descendants={descendants}
            me={me}
            editMode={editMode}
            isAdmin={isAdmin}
            manageable={manageable}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
            onMove={(to) => move.mutate({ id: selected.id, to })}
            onTitle={(designation) => rename.mutate({ id: selected.id, designation })}
            onCreated={(text) => setMsg({ kind: 'ok', text })}
            onError={(text) => setMsg({ kind: 'err', text })}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
            Select a person to see who they manage
            {canEdit ? '. Turn on editing to change the chart' : ''}.
            {isAdmin && editMode ? (
              <AddPerson
                tree={tree}
                defaultParent={null}
                onCreated={(t) => setMsg({ kind: 'ok', text: t })}
                onError={(t) => setMsg({ kind: 'err', text: t })}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonPanel({
  person,
  tree,
  model,
  descendants,
  me,
  editMode,
  isAdmin,
  manageable,
  onSelect,
  onClose,
  onMove,
  onTitle,
  onCreated,
  onError,
}: {
  person: OrgTreePerson;
  tree: OrgTree;
  model: { byId: Map<string, OrgTreePerson>; children: Map<string, OrgTreePerson[]> };
  descendants: (id: string) => Set<string>;
  me: string | undefined;
  editMode: boolean;
  isAdmin: boolean;
  manageable: Set<string>;
  onSelect: (id: string) => void;
  onClose: () => void;
  onMove: (to: string | null) => void;
  onTitle: (designation: string) => void;
  onCreated: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [title, setTitle] = useState(person.designation ?? '');
  const boss = person.reportsToId ? model.byId.get(person.reportsToId) : undefined;
  const reports = model.children.get(person.id) ?? [];
  const mayChange = editMode && manageable.has(person.id);
  const blocked = descendants(person.id);
  const options = tree.people.filter(
    (p) =>
      p.id !== person.id && !blocked.has(p.id) && (isAdmin || p.id === me || manageable.has(p.id)),
  );
  return (
    <aside
      aria-label={`${person.name} details`}
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#1e1e1e]"
    >
      <div className="flex items-start gap-3">
        <Avatar user={person} size="md" />
        <div className="min-w-0">
          <h2 className="break-words text-lg font-extrabold leading-snug">{person.name}</h2>
          <p className="text-xs text-slate-500">{person.designation ?? 'No title set'}</p>
          <p className="text-xs text-slate-500">
            {boss ? (
              <>
                Reports to{' '}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => onSelect(boss.id)}
                >
                  {boss.name}
                </button>
              </>
            ) : (
              'Top of the chart'
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          className="ml-auto px-2 py-1 text-xs"
          onClick={onClose}
          aria-label="Close details"
        >
          Close
        </Button>
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Direct reports ({reports.length})
        </div>
        {reports.length ? (
          <ul className="mt-1 space-y-1">
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
                  onClick={() => onSelect(r.id)}
                >
                  <Avatar user={r} size="sm" />
                  <span className="truncate font-medium">{r.name}</span>
                  {r.designation ? (
                    <span className="truncate text-xs text-slate-500">· {r.designation}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Nobody reports to {person.name.split(' ')[0]}.
          </p>
        )}
      </div>

      {mayChange ? (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Reports to
            </div>
            <div className="mt-1">
              <SearchableSelect
                ariaLabel="Change manager"
                options={options.map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: p.designation ?? undefined,
                }))}
                value={person.reportsToId ?? ''}
                onChange={(v) => {
                  if ((v || null) !== person.reportsToId) onMove(v || null);
                }}
                emptyLabel={isAdmin ? 'Top of the chart (CEO)' : undefined}
                placeholder="Search for a manager…"
              />
            </div>
          </div>
          <div>
            <label
              className="block text-xs font-bold uppercase tracking-wider text-slate-500"
              htmlFor="org-title"
            >
              Title
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                id="org-title"
                aria-label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Designer"
              />
              <Button
                variant="ghost"
                className="px-3 text-xs"
                disabled={title === (person.designation ?? '')}
                onClick={() => onTitle(title)}
              >
                Save
              </Button>
            </div>
          </div>
          {isAdmin ? <PersonTeamMemberships person={person} tree={tree} onError={onError} /> : null}
        </div>
      ) : editMode ? (
        <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700">
          {isAdmin ? '' : 'You can only change people who report to you.'}
        </p>
      ) : null}

      {isAdmin && editMode ? (
        <RemoveFromChart person={person} onDone={onClose} onMsg={onCreated} onErr={onError} />
      ) : null}

      {isAdmin && editMode ? (
        <AddPerson tree={tree} defaultParent={person.id} onCreated={onCreated} onError={onError} />
      ) : null}
    </aside>
  );
}

/** Team membership is edited from the person record, but saved through the same
 * team-members endpoint used by the Teams tab so both views stay in sync. */
function PersonTeamMemberships({
  person,
  tree,
  onError,
}: {
  person: OrgTreePerson;
  tree: OrgTree;
  onError: (text: string) => void;
}) {
  const qc = useQueryClient();
  const initial = useMemo(
    () =>
      new Set(
        tree.teams.filter((team) => team.memberIds.includes(person.id)).map((team) => team.id),
      ),
    [person.id, tree.teams],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const changed = selected.size !== initial.size || [...selected].some((id) => !initial.has(id));
  const save = useMutation({
    mutationFn: async () => {
      const changedTeams = tree.teams.filter(
        (team) => selected.has(team.id) !== team.memberIds.includes(person.id),
      );
      await Promise.all(
        changedTeams.map((team) => {
          const userIds = selected.has(team.id)
            ? [...new Set([...team.memberIds, person.id])]
            : team.memberIds.filter((id) => id !== person.id);
          return http.put(`/organisation/teams/${team.id}/members`, { userIds });
        }),
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['org-tree'] }),
    onError: (error) =>
      onError(
        error instanceof ApiRequestError ? error.message : 'Could not update team memberships',
      ),
  });

  useEffect(() => setSelected(new Set(initial)), [initial]);

  return (
    <fieldset className="border-t border-slate-200 pt-3 dark:border-slate-700">
      <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Team memberships
      </legend>
      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
        {tree.teams.map((team) => (
          <label
            key={team.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
          >
            <input
              type="checkbox"
              checked={selected.has(team.id)}
              onChange={(event) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(team.id);
                  else next.delete(team.id);
                  return next;
                })
              }
            />
            <span className="truncate">{team.name}</span>
            {team.managerId === person.id ? (
              <span className="text-[10px] font-semibold text-slate-400">Manager</span>
            ) : null}
          </label>
        ))}
      </div>
      <Button
        variant="ghost"
        className="mt-2 px-3 py-1.5 text-xs"
        disabled={!changed || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? 'Saving…' : 'Save team memberships'}
      </Button>
    </fieldset>
  );
}

function AddPerson({
  tree,
  defaultParent,
  onCreated,
  onError,
}: {
  tree: OrgTree;
  defaultParent: string | null;
  onCreated: (t: string) => void;
  onError: (t: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [parent, setParent] = useState(defaultParent ?? '');
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const create = useMutation({
    mutationFn: () =>
      http.post<{ name: string; tempPassword: string }>('/org-tree/people', {
        name: name.trim(),
        email: email.trim(),
        designation: designation.trim() || undefined,
        reportsToId: parent || null,
      }),
    onSuccess: (r) => {
      setTemp({ name: r.name, password: r.tempPassword });
      onCreated(`${r.name} was added.`);
      setName('');
      setEmail('');
      setDesignation('');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['org-tree'] });
    },
    onError: (e) => onError(e instanceof ApiRequestError ? e.message : 'Could not add that person'),
  });
  const sel =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-[#252525]';
  return (
    <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
      {temp ? (
        <div
          className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
          role="status"
        >
          <div className="font-semibold">Temporary password for {temp.name}</div>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs dark:bg-[#222]">
            {temp.password}
          </code>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Shown once. They must change it at first sign-in.
          </p>
          <Button variant="ghost" className="mt-2 px-2 py-1 text-xs" onClick={() => setTemp(null)}>
            Done
          </Button>
        </div>
      ) : null}
      {!open ? (
        <Button
          variant="ghost"
          className="px-3 py-1.5 text-xs"
          onClick={() => {
            setParent(defaultParent ?? '');
            setOpen(true);
          }}
        >
          + Add a person{defaultParent ? ' here' : ''}
        </Button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          aria-label="Add a person"
        >
          <Input
            aria-label="Full name"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            aria-label="Email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            aria-label="New person's title"
            placeholder="Title (optional)"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          />
          <select
            aria-label="New person reports to"
            className={sel}
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            <option value="">Top of the chart</option>
            {tree.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending || !name.trim() || !email.trim()}>
              {create.isPending ? 'Adding…' : 'Add person'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function RemoveFromChart({
  person,
  onDone,
  onMsg,
  onErr,
}: {
  person: OrgTreePerson;
  onDone: () => void;
  onMsg: (t: string) => void;
  onErr: (t: string) => void;
}) {
  const qc = useQueryClient();
  const [sure, setSure] = useState(false);
  const remove = useMutation({
    mutationFn: () => http.del<{ movedReports: number }>(`/org-tree/people/${person.id}`),
    onSuccess: (r) => {
      onMsg(
        `${person.name} was taken off the chart${r.movedReports ? `; their ${r.movedReports} report${r.movedReports > 1 ? 's' : ''} moved up one level` : ''}. Their account is unchanged.`,
      );
      void qc.invalidateQueries({ queryKey: ['org-tree'] });
      onDone();
    },
    onError: (e) =>
      onErr(e instanceof ApiRequestError ? e.message : 'Could not take them off the chart'),
  });
  if (!person.reportsToId && !person.isTop) return null;
  return (
    <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
      {!sure ? (
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setSure(true)}>
          Take off the chart…
        </Button>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/20">
          <p>
            Take {person.name} off the chart? Their account stays, and anyone reporting to them
            moves up one level.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Yes, take off
            </Button>
            <Button variant="ghost" onClick={() => setSure(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
