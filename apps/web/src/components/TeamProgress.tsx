import { useState } from 'react';
import type { BoardTeamSummary, MeetingBoardDetail } from '@task-tracker/shared';
import { Avatar } from './Avatar';
import { ProgressBar } from './ProgressBar';

const teamName = (t: BoardTeamSummary) => t.team?.name ?? 'No team';

/** Compact one-line-per-team progress, shown at the top of the Weekly tasks page (Tech, Production, ...). */
export function TeamProgressStrip({ board }: { board: MeetingBoardDetail }) {
  const teams = board.teams ?? [];
  if (teams.length === 0) return null;
  return (
    <div className="mt-4" data-team-strip>
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Progress by team</div>
        <div className="group relative flex items-center justify-center">
          <span className="cursor-help rounded-full bg-slate-200 text-[10px] font-bold text-slate-500 w-4 h-4 inline-flex items-center justify-center dark:bg-[#2a2a2a] dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">?</span>
          <div className="absolute left-1/2 bottom-full mb-2 w-64 -translate-x-1/2 scale-95 opacity-0 pointer-events-none transition-all group-hover:scale-100 group-hover:opacity-100 group-hover:pointer-events-auto z-50 rounded-lg bg-slate-900 p-3 text-xs text-slate-200 shadow-xl dark:bg-slate-800 border border-slate-700">
            <p className="font-bold mb-1 text-white">Cross-team tasks</p>
            <p className="text-slate-300 leading-relaxed">If a task involves members from multiple teams, it is counted in each team's progress, but only counted once in the overall "Everyone" total. This means team totals may sum up to more than the overall total.</p>
            <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-slate-900 dark:bg-slate-800 border-b border-r border-slate-700"></div>
          </div>
        </div>
      </div>
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <li key={t.team?.id ?? 'none'} data-team-row={t.team?.id ?? 'none'}>
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{teamName(t)}</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {t.progress.total === 0 ? 'nothing planned' : `${t.progress.done}/${t.progress.total} done`}
              </span>
              <span className="ml-auto text-sm font-bold text-slate-600 dark:text-slate-300">{t.progress.total === 0 ? '–' : `${t.progress.percent}%`}</span>
            </div>
            <ProgressBar progress={t.progress} size="sm" showLabel={false} className="mt-1" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Per-team cards for the Team & Progress tab: the team's bar, then each person's bar underneath. */
export function TeamProgressCards({ board }: { board: MeetingBoardDetail }) {
  const teams = board.teams ?? [];
  const [open, setOpen] = useState<Set<string>>(new Set());
  const byUser = new Map(board.members.map((m) => [m.user.id, m]));
  const toggle = (key: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  if (teams.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No teams are set up yet. An admin can create them under Org tree.</p>;
  }
  return (
    <ul className="space-y-3">
      {teams.map((t) => {
        const key = t.team?.id ?? 'none';
        const isOpen = open.has(key);
        const people = t.memberIds.map((id) => byUser.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
        return (
          <li key={key} data-team-card={key} className="rounded-xl border border-slate-100 p-3 dark:border-[#2a2a2a]">
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-expanded={isOpen}
              aria-label={`${teamName(t)}, ${t.progress.done} of ${t.progress.total} done`}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
            >
              <span className="text-sm font-bold text-slate-800 dark:text-white">{teamName(t)}</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {t.peopleCount} {t.peopleCount === 1 ? 'person' : 'people'}
                {t.idleCount > 0 ? ` · ${t.idleCount} with nothing planned` : ''}
              </span>
              <span className="ml-auto text-sm font-bold text-slate-600 dark:text-slate-300">{t.progress.total === 0 ? 'Nothing planned' : `${t.progress.done}/${t.progress.total} · ${t.progress.percent}%`}</span>
              <span aria-hidden className="text-xs text-slate-400">{isOpen ? '▲' : '▼'}</span>
            </button>
            <ProgressBar progress={t.progress} size="md" showLabel={false} className="mt-2" />
            {isOpen ? (
              people.length ? (
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-[#2a2a2a]">
                  {people.map((m) => (
                    <li key={m.user.id} className="flex items-center gap-2.5">
                      <Avatar user={m.user} size="sm" />
                      <span className="w-32 shrink-0 truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:w-44">{m.user.name}</span>
                      <ProgressBar progress={m.progress} size="sm" className="min-w-0 flex-1" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-500 dark:border-[#2a2a2a] dark:text-slate-400">Nobody in this team has planned anything this week.</p>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
