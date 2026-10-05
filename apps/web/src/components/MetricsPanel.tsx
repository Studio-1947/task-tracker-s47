import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CommitmentBasis, RatioMetric, WorkspaceMetrics } from '@task-tracker/shared';
import { ApiRequestError, apiBlob, http } from '../lib/api';
import { formatWorkingDuration } from '../lib/format';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { Button, Card, ErrorState, Spinner } from './ui';

export type Period = '7d' | '30d' | 'month';

export interface MetricFilters {
  workspaceId: string;
  period: Period;
  basis: CommitmentBasis;
}

function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getTime() + 60_000);
  if (p === 'month')
    return {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      to: to.toISOString(),
    };
  const days = p === '7d' ? 7 : 30;
  return { from: new Date(now.getTime() - days * 86400000).toISOString(), to: to.toISOString() };
}

const pctLabel = (p: number | null) => (p === null ? 'No data' : `${p}%`);

interface CardSpec {
  key: string;
  label: string;
  primary: string;
  detail: string;
  taskIds?: string[];
  tone?: 'danger';
}

/** Shared period / workspace / commitment-view filters, shown once at the top of the dashboard (spec section 10). */
export function MetricFilterBar({
  value,
  onChange,
}: {
  value: MetricFilters;
  onChange: (v: MetricFilters) => void;
}) {
  const { data: workspaces } = useWorkspaces();
  const active = (workspaces ?? []).filter((w) => !w.isArchived);
  const select =
    'min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white';
  return (
    <div
      role="group"
      aria-label="Dashboard filters"
      className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white/90 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-[#181818]/90"
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Workspace
      </span>
      <select
        aria-label="Workspace"
        className={select}
        value={value.workspaceId}
        onChange={(e) => onChange({ ...value, workspaceId: e.target.value })}
      >
        {active.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Period"
        className={select}
        value={value.period}
        onChange={(e) => onChange({ ...value, period: e.target.value as Period })}
      >
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="month">This month</option>
      </select>
      <select
        aria-label="Commitment view"
        className={select}
        value={value.basis}
        onChange={(e) => onChange({ ...value, basis: e.target.value as CommitmentBasis })}
      >
        <option value="ORIGINAL">Original commitment</option>
        <option value="REVISED">Revised commitment</option>
      </select>
      <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">
        Workspace selection updates dashboard analytics and delivery metrics.
      </span>
    </div>
  );
}

/**
 * Delivery metrics for one workspace and period. Every card shows its
 * numerator / denominator and can open the exact tasks behind the count; the
 * CSV button exports the same object the cards are drawn from.
 */
export function MetricsPanel({ filters }: { filters: MetricFilters }) {
  const { workspaceId: targetId, period, basis } = filters;
  const [open, setOpen] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const range = useMemo(() => periodRange(period), [period]);
  const qs = `workspaceId=${targetId}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&basis=${basis}`;

  const {
    data: m,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['metrics', targetId, period, basis],
    queryFn: () => http.get<WorkspaceMetrics>(`/metrics/workspace?${qs}`),
    enabled: !!targetId,
  });
  const { data: refs } = useQuery({
    queryKey: ['metrics-refs', targetId],
    queryFn: () =>
      http.get<{ items: Array<{ id: string; ref: string; title: string }> }>(
        `/workspaces/${targetId}/tasks?pageSize=100&includeArchived=true`,
      ),
    enabled: !!targetId && !!open,
  });
  const refOf = new Map((refs?.items ?? []).map((t) => [t.id, t]));

  const ratio = (label: string, key: string, r: RatioMetric, unit = ''): CardSpec => ({
    key,
    label,
    primary: r.notApplicable ? 'No data' : pctLabel(r.percentage),
    detail: r.notApplicable
      ? `Not applicable (nothing eligible${unit ? ` ${unit}` : ''})`
      : `${r.numerator} of ${r.denominator}${unit ? ` ${unit}` : ''}`,
    taskIds: r.taskIds,
  });

  const cards: CardSpec[] = m
    ? [
        {
          key: 'open',
          label: 'Open tasks',
          primary: String(m.openTasks.count),
          detail: `${m.scope.topLevelTasks} task(s) in scope (including subtasks)`,
          taskIds: m.openTasks.taskIds,
        },
        {
          key: 'overdue',
          label: 'Overdue commitments',
          primary: String(m.overdueCommitments.count),
          detail: `of ${m.openTasks.count} open · ${m.scope.basis === 'ORIGINAL' ? 'original' : 'revised'} due dates`,
          taskIds: m.overdueCommitments.taskIds,
          tone: m.overdueCommitments.count > 0 ? 'danger' : undefined,
        },
        ratio('On-time submission', 'sub', m.onTimeSubmission),
        ratio('On-time acceptance', 'acc', m.onTimeAcceptance),
        ratio('First-pass acceptance', 'first', m.firstPassAcceptance),
        {
          key: 'turnaround',
          label: 'Review turnaround',
          primary:
              m.reviewTurnaround.medianMinutes === null
                ? 'No data'
                : formatWorkingDuration(m.reviewTurnaround.medianMinutes),
          detail: m.reviewTurnaround.sampleSize
            ? `median of ${m.reviewTurnaround.sampleSize} decision(s) · p90 ${formatWorkingDuration(m.reviewTurnaround.p90Minutes ?? 0)} (working time)`
            : 'No decisions in period',
        },
        {
          ...ratio('Update discipline', 'update', m.updateDiscipline, 'eligible days'),
          taskIds: undefined,
        },
        {
          key: 'util',
          label: 'Planned utilisation',
          primary: pctLabel(m.plannedUtilisation.percentage),
          detail: m.plannedUtilisation.notApplicable
            ? 'No available capacity in period'
            : `${formatWorkingDuration(m.plannedUtilisation.allocatedMinutes)} allocated of ${formatWorkingDuration(m.plannedUtilisation.availableMinutes)} · ${m.plannedUtilisation.missingAllocationUserIds.length} with no allocation`,
        },
        {
          key: 'rework',
          label: 'Rework effort',
          primary: m.reworkEffort.totalMinutes === 0 ? 'No data' : pctLabel(m.reworkEffort.percentage),
          detail: `${formatWorkingDuration(m.reworkEffort.reworkMinutes)} of ${formatWorkingDuration(m.reworkEffort.totalMinutes)} · ${m.reworkEffort.returnedSubmissions.count} returned · ${m.scopeChanges.count} scope change(s) reported separately`,
          taskIds: m.reworkEffort.returnedSubmissions.taskIds,
        },
      ]
    : [];

  const download = async () => {
    setDownloadError(null);
    try {
      const blob = await apiBlob(`/metrics/workspace.csv?${qs}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace-metrics-${range.from.slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof ApiRequestError ? err.message : 'Could not download the export',
      );
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
            Delivery metrics
          </h2>
          {m ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {m.scope.workspaceName} · active tasks only (including subtasks) · metric v{m.scope.metricVersion} ·{' '}
              {m.reconciliation.consistent ? 'totals reconcile' : 'TOTALS DO NOT RECONCILE'}
            </p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={() => void download()} disabled={!m}>
          Export CSV
        </Button>
      </div>
      {downloadError ? <p className="text-sm text-red-600">{downloadError}</p> : null}
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState
          message={error instanceof ApiRequestError ? error.message : 'Could not load metrics'}
        />
      ) : null}
      {m ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div
                key={c.key}
                className="rounded-xl border border-slate-100 p-3 dark:border-slate-800"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {c.label}
                </h3>
                <div
                  className={`mt-1 text-2xl font-extrabold tabular-nums ${c.tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}
                >
                  {c.primary}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.detail}</div>
                {c.taskIds?.length ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                    onClick={() => setOpen(open === c.key ? null : c.key)}
                  >
                    {open === c.key ? 'Hide tasks' : `Show ${c.taskIds.length} task(s)`}
                  </button>
                ) : null}
                {open === c.key && c.taskIds ? (
                  <ul className="mt-2 space-y-1">
                    {c.taskIds.map((id) => (
                      <li key={id} className="truncate text-xs">
                        <Link
                          className="text-indigo-600 hover:underline dark:text-indigo-400"
                          to={`/workspaces/${m.scope.workspaceId}?task=${id}`}
                        >
                          {refOf.get(id) ? `${refOf.get(id)!.ref} · ${refOf.get(id)!.title}` : id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
          {m.legacyUnverified.count > 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {m.legacyUnverified.count} accepted task(s) have no recorded submission and are
              excluded from quality metrics rather than back-filled.
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
