import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { AuditAction, TASK_STATUSES, localMidnight, localWorkDate, workingMinutesElapsed } from '@task-tracker/shared';
import type { CommitmentBasis, RatioMetric, WorkspaceMetrics } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  auditLogs,
  leaveRequests,
  projects,
  taskAttachments,
  taskBlockers,
  taskComments,
  taskEstimateRevisions,
  taskSubmissions,
  taskTimeEntries,
  tasks,
  workspaces,
} from '../database/schema';
import { CalendarService } from '../calendar/calendar.service';
import { TasksService } from '../tasks/tasks.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

export const METRIC_VERSION = '2.0';
export type { CommitmentBasis };

const metric = (ids: string[], denominator: number): RatioMetric => ({
  numerator: ids.length,
  denominator,
  percentage: denominator ? Math.round((ids.length / denominator) * 10000) / 100 : null,
  notApplicable: denominator === 0,
  taskIds: ids,
});

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]! : null);

/**
 * The single source for dashboard cards, drill-downs and exports (PRD §10 "shared
 * metric layer"): one scope definition, one set of formulas, and every figure
 * carries its numerator, denominator and the exact task ids behind it.
 */
@Injectable()
export class MetricsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly calendar: CalendarService,
    private readonly workspaces: WorkspacesService,
    private readonly tasksService: TasksService,
  ) {}

  async workspaceMetrics(
    workspaceId: string,
    fromIso: string,
    toIso: string,
    actor: { id: string; role: string },
    basis: CommitmentBasis = 'ORIGINAL',
  ): Promise<WorkspaceMetrics> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(from < to)) throw new Error('Invalid metric period');
    const now = new Date();
    const cal = await this.calendar.get();
    const tz = cal.settings?.timezone ?? 'Asia/Kolkata';

    const [workspace] = await this.db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const allRows = await this.db
      .select({
        id: tasks.id,
        status: tasks.status,
        parentTaskId: tasks.parentTaskId,
        ownerId: tasks.ownerId,
        dueDate: tasks.dueDate,
        originalDueDate: tasks.originalDueDate,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.isArchived, false)));
    const topLevel = allRows.filter((t) => !t.parentTaskId);
    const topIds = topLevel.map((t) => t.id);
    const dueOf = (t: (typeof topLevel)[number]) => (basis === 'ORIGINAL' ? t.originalDueDate ?? t.dueDate : t.dueDate);

    const submissions = topIds.length
      ? await this.db.select().from(taskSubmissions).where(inArray(taskSubmissions.taskId, topIds)).orderBy(asc(taskSubmissions.submittedAt))
      : [];
    const subsByTask = new Map<string, typeof submissions>();
    for (const s of submissions) subsByTask.set(s.taskId, [...(subsByTask.get(s.taskId) ?? []), s]);

    // Accepted with no submission at all is legacy completion: excluded, not back-filled.
    const legacy = topLevel.filter((t) => t.status === 'DONE' && !(subsByTask.get(t.id)?.length));
    const legacyIds = new Set(legacy.map((t) => t.id));

    const open = topLevel.filter((t) => t.status !== 'DONE');
    const overdue = open.filter((t) => {
      const due = dueOf(t);
      return !!due && due < now;
    });

    const eligible = topLevel.filter((t) => {
      const due = dueOf(t);
      return !!due && due >= from && due < to && !legacyIds.has(t.id);
    });
    const onTimeSubmissionIds = eligible
      .filter((t) => {
        const first = subsByTask.get(t.id)?.[0];
        return !!first && first.submittedAt <= dueOf(t)!;
      })
      .map((t) => t.id);
    const onTimeAcceptanceIds = eligible
      .filter((t) => {
        const accepted = subsByTask.get(t.id)?.find((s) => s.status === 'ACCEPTED');
        return !!accepted?.decidedAt && accepted.decidedAt <= dueOf(t)!;
      })
      .map((t) => t.id);

    // First review decision per deliverable, counted in the period it was made.
    const firstDecided = topLevel
      .map((t) => ({ id: t.id, first: subsByTask.get(t.id)?.find((s) => s.decidedAt) }))
      .filter((x): x is { id: string; first: NonNullable<typeof x.first> } => !!x.first && x.first.decidedAt! >= from && x.first.decidedAt! < to);
    const firstPassIds = firstDecided.filter((x) => x.first.status === 'ACCEPTED').map((x) => x.id);

    const decidedInPeriod = submissions.filter((s) => s.decidedAt && s.decidedAt >= from && s.decidedAt < to);
    const reviewMinutes = cal.settings
      ? decidedInPeriod
          .map((s) => workingMinutesElapsed(s.submittedAt.toISOString(), s.decidedAt!.toISOString(), cal.settings!, cal.exceptions))
          .sort((a, b) => a - b)
      : [];
    const returnedIds = [...new Set(decidedInPeriod.filter((s) => s.status === 'RETURNED').map((s) => s.taskId))];

    const updateDiscipline = await this.computeUpdateDiscipline(topLevel, from, to, now, tz, cal);
    const plannedUtilisation = await this.computePlannedUtilisation(workspaceId, actor, from, to, tz);

    const fromDate = localWorkDate(from, tz);
    const toDate = localWorkDate(new Date(to.getTime() - 1), tz);
    const entries = allRows.length
      ? await this.db
          .select({ minutes: taskTimeEntries.durationMinutes, category: taskTimeEntries.category })
          .from(taskTimeEntries)
          .where(and(inArray(taskTimeEntries.taskId, allRows.map((t) => t.id)), gte(taskTimeEntries.workDate, fromDate), lte(taskTimeEntries.workDate, toDate)))
      : [];
    const reworkMinutes = entries.filter((e) => e.category === 'REWORK').reduce((s, e) => s + e.minutes, 0);
    const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);

    const revisions = allRows.length
      ? await this.db
          .select()
          .from(taskEstimateRevisions)
          .where(and(inArray(taskEstimateRevisions.taskId, allRows.map((t) => t.id)), gte(taskEstimateRevisions.createdAt, from), lt(taskEstimateRevisions.createdAt, to)))
      : [];
    const byClassification: Record<string, number> = {};
    for (const r of revisions) byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;

    const statusBreakdown = Object.fromEntries(TASK_STATUSES.map((s) => [s, topLevel.filter((t) => t.status === s).length])) as Record<string, number>;
    const breakdownTotal = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);

    return {
      scope: {
        workspaceId,
        workspaceName: workspace?.name ?? '',
        from: from.toISOString(),
        to: to.toISOString(),
        basis,
        archivePolicy: 'ACTIVE_ONLY',
        countedLevel: 'TOP_LEVEL',
        topLevelTasks: topLevel.length,
        subtasksExcluded: allRows.length - topLevel.length,
        generatedAt: now.toISOString(),
        metricVersion: METRIC_VERSION,
      },
      openTasks: { count: open.length, taskIds: open.map((t) => t.id) },
      overdueCommitments: { count: overdue.length, taskIds: overdue.map((t) => t.id), asOf: now.toISOString() },
      onTimeSubmission: metric(onTimeSubmissionIds, eligible.length),
      onTimeAcceptance: metric(onTimeAcceptanceIds, eligible.length),
      firstPassAcceptance: metric(firstPassIds, firstDecided.length),
      reviewTurnaround: { sampleSize: reviewMinutes.length, medianMinutes: percentile(reviewMinutes, 0.5), p90Minutes: percentile(reviewMinutes, 0.9) },
      updateDiscipline,
      plannedUtilisation,
      reworkEffort: {
        reworkMinutes,
        totalMinutes,
        percentage: totalMinutes ? Math.round((reworkMinutes / totalMinutes) * 10000) / 100 : null,
        entries: entries.filter((e) => e.category === 'REWORK').length,
        returnedSubmissions: { count: returnedIds.length, taskIds: returnedIds },
      },
      scopeChanges: { count: revisions.length, netEstimateMinutes: revisions.reduce((s, r) => s + (r.revisedEstimateMinutes - r.previousEstimateMinutes), 0), byClassification },
      legacyUnverified: { count: legacy.length, taskIds: legacy.map((t) => t.id) },
      reconciliation: { statusBreakdown, topLevelTotal: topLevel.length, consistent: breakdownTotal === topLevel.length && open.length === topLevel.length - statusBreakdown.DONE! },
    };
  }

  /**
   * Update discipline: of the eligible assigned-work days, the share on which the
   * task got a meaningful update. Eligible = a scheduled working day on which the
   * task was in progress under an owner who was not on leave, and the work was
   * neither blocked nor awaiting review. A status toggle alone is not an update.
   * Only tasks currently in progress are assessed — we cannot reconstruct the
   * history of finished work reliably, and unknown history stays unknown.
   */
  private async computeUpdateDiscipline(
    topLevel: Array<{ id: string; status: string; ownerId: string | null; createdAt: Date }>,
    from: Date,
    to: Date,
    now: Date,
    tz: string,
    cal: Awaited<ReturnType<CalendarService['get']>>,
  ): Promise<RatioMetric & { eligibleDays: number }> {
    const candidates = topLevel.filter((t) => t.status === 'IN_PROGRESS' && t.ownerId);
    if (!candidates.length || !cal.settings) return { ...metric([], 0), eligibleDays: 0 };
    const ids = candidates.map((c) => c.id);
    const ownerIds = [...new Set(candidates.map((c) => c.ownerId!))];
    const dateOf = (d: Date) => localWorkDate(d, tz);

    const [comments, attachments, revisions, subs, entries, statusChanges, blockers, leaves] = await Promise.all([
      this.db.select({ taskId: taskComments.taskId, at: taskComments.createdAt }).from(taskComments).where(inArray(taskComments.taskId, ids)),
      this.db.select({ taskId: taskAttachments.taskId, at: taskAttachments.createdAt }).from(taskAttachments).where(inArray(taskAttachments.taskId, ids)),
      this.db.select({ taskId: taskEstimateRevisions.taskId, at: taskEstimateRevisions.createdAt }).from(taskEstimateRevisions).where(inArray(taskEstimateRevisions.taskId, ids)),
      this.db.select({ taskId: taskSubmissions.taskId, from: taskSubmissions.submittedAt, to: taskSubmissions.decidedAt }).from(taskSubmissions).where(inArray(taskSubmissions.taskId, ids)),
      this.db.select({ taskId: taskTimeEntries.taskId, day: taskTimeEntries.workDate }).from(taskTimeEntries).where(inArray(taskTimeEntries.taskId, ids)),
      this.db
        .select({ taskId: auditLogs.taskId, at: auditLogs.createdAt })
        .from(auditLogs)
        .where(and(inArray(auditLogs.taskId, ids), eq(auditLogs.action, AuditAction.STATUS_CHANGED))),
      this.db.select({ taskId: taskBlockers.taskId, from: taskBlockers.blockedAt, to: taskBlockers.unblockedAt }).from(taskBlockers).where(inArray(taskBlockers.taskId, ids)),
      this.db.select().from(leaveRequests).where(and(inArray(leaveRequests.userId, ownerIds), eq(leaveRequests.status, 'APPROVED'))),
    ]);

    const workdays = cal.settings.workdays;
    const holidays = new Set(cal.exceptions.filter((e) => e.kind === 'HOLIDAY').map((e) => e.date));
    const forced = new Set(cal.exceptions.filter((e) => e.kind === 'WORKING_DAY').map((e) => e.date));
    const numeratorIds: string[] = [];
    let eligibleDays = 0;
    let updatedDays = 0;

    for (const c of candidates) {
      const signalDays = new Set<string>();
      for (const s of [...comments, ...attachments, ...revisions]) if (s.taskId === c.id) signalDays.add(dateOf(s.at));
      for (const s of subs) if (s.taskId === c.id) signalDays.add(dateOf(s.from));
      for (const e of entries) if (e.taskId === c.id) signalDays.add(e.day);
      const lastToggle = statusChanges.filter((s) => s.taskId === c.id).reduce<Date | null>((m, s) => (!m || s.at > m ? s.at : m), null);
      const start = new Date(Math.max(from.getTime(), (lastToggle ?? c.createdAt).getTime()));
      const end = new Date(Math.min(to.getTime(), now.getTime()));
      let taskUpdated = 0;
      let taskEligible = 0;
      for (let day = dateOf(start), guard = 0; guard < 400; guard += 1) {
        const dayStart = localMidnight(day, tz);
        if (dayStart >= end) break;
        const dayEnd = localMidnight(new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10), tz);
        const scheduled = !holidays.has(day) && (forced.has(day) || workdays.includes(new Date(`${day}T00:00:00.000Z`).getUTCDay()));
        const onLeave = leaves.some((l) => l.userId === c.ownerId && l.startDate <= day && l.endDate >= day);
        const blocked = blockers.some((b) => b.taskId === c.id && b.from < dayEnd && (b.to ?? now) > dayStart);
        const inReview = subs.some((s) => s.taskId === c.id && s.from < dayEnd && (s.to ?? now) > dayStart);
        if (scheduled && !onLeave && !blocked && !inReview) {
          taskEligible += 1;
          if (signalDays.has(day)) taskUpdated += 1;
        }
        day = new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
      }
      eligibleDays += taskEligible;
      updatedDays += taskUpdated;
      if (taskEligible > 0 && taskUpdated === taskEligible) numeratorIds.push(c.id);
    }
    return {
      numerator: updatedDays,
      denominator: eligibleDays,
      percentage: eligibleDays ? Math.round((updatedDays / eligibleDays) * 10000) / 100 : null,
      notApplicable: eligibleDays === 0,
      // Drill-down: the tasks that were updated on every eligible day; the counts above are in days.
      taskIds: numeratorIds,
      eligibleDays,
    };
  }

  private async computePlannedUtilisation(workspaceId: string, actor: { id: string; role: string }, from: Date, to: Date, tz: string) {
    const rows = await this.tasksService.weeklyCapacity(workspaceId, actor, localWorkDate(from, tz), localWorkDate(new Date(to.getTime() - 1), tz));
    const allocated = rows.reduce((s, r) => s + r.allocatedMinutes, 0);
    const available = rows.reduce((s, r) => s + r.availableMinutes, 0);
    return {
      allocatedMinutes: allocated,
      availableMinutes: available,
      percentage: available ? Math.round((allocated / available) * 10000) / 100 : null,
      notApplicable: available === 0,
      missingAllocationUserIds: rows.filter((r) => r.availableMinutes > 0 && r.allocatedMinutes === 0).map((r) => r.user.id),
      zeroCapacityUserIds: rows.filter((r) => r.availableMinutes === 0).map((r) => r.user.id),
    };
  }

  /** CSV built from the exact object the JSON endpoint returns, so the two cannot drift. */
  async workspaceMetricsCsv(m: WorkspaceMetrics): Promise<Buffer> {
    const cell = (v: string | number | null | undefined) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const pct = (p: number | null) => (p === null ? 'n/a' : `${p}%`);
    const refs = await this.taskRefs([
      ...m.openTasks.taskIds,
      ...m.overdueCommitments.taskIds,
      ...m.onTimeSubmission.taskIds,
      ...m.onTimeAcceptance.taskIds,
      ...m.firstPassAcceptance.taskIds,
      ...m.updateDiscipline.taskIds,
      ...m.reworkEffort.returnedSubmissions.taskIds,
      ...m.legacyUnverified.taskIds,
    ]);
    const drill = (label: string, ids: string[]): (string | number)[][] =>
      ids.map((id) => [label, refs.get(id)?.ref ?? id, refs.get(id)?.title ?? '', refs.get(id)?.status ?? '', id]);
    const s = m.scope;
    const lines: (string | number | null)[][] = [
      ['Workspace delivery metrics'],
      ['Workspace', s.workspaceName],
      ['Workspace id', s.workspaceId],
      ['Period from', s.from],
      ['Period to (exclusive)', s.to],
      ['Commitment basis', s.basis === 'ORIGINAL' ? 'Original commitment (first due date)' : 'Revised commitment (current due date)'],
      ['Scope', `Active (non-archived) top-level tasks: ${s.topLevelTasks}; ${s.subtasksExcluded} subtask(s) counted separately, not included`],
      ['Generated at', s.generatedAt],
      ['Metric version', s.metricVersion],
      [],
      ['Metric', 'Numerator', 'Denominator', 'Percentage', 'Sample size', 'Definition'],
      ['Open tasks', m.openTasks.count, '', '', m.openTasks.count, 'Top-level tasks not accepted (DONE)'],
      ['Overdue commitments', m.overdueCommitments.count, m.openTasks.count, '', m.openTasks.count, `Open tasks whose due date has passed as of ${m.overdueCommitments.asOf}`],
      ['On-time submission', m.onTimeSubmission.numerator, m.onTimeSubmission.denominator, pct(m.onTimeSubmission.percentage), m.onTimeSubmission.denominator, 'Due deliverables with a first submission by the commitment / eligible deliverables due'],
      ['On-time acceptance', m.onTimeAcceptance.numerator, m.onTimeAcceptance.denominator, pct(m.onTimeAcceptance.percentage), m.onTimeAcceptance.denominator, 'Due deliverables accepted by the commitment / eligible deliverables due'],
      ['First-pass acceptance', m.firstPassAcceptance.numerator, m.firstPassAcceptance.denominator, pct(m.firstPassAcceptance.percentage), m.firstPassAcceptance.denominator, 'Accepted at first review decision / deliverables with a first decision in the period'],
      ['Review turnaround median (working min)', m.reviewTurnaround.medianMinutes ?? 'n/a', '', '', m.reviewTurnaround.sampleSize, 'Scheduled working minutes from submission to decision'],
      ['Review turnaround p90 (working min)', m.reviewTurnaround.p90Minutes ?? 'n/a', '', '', m.reviewTurnaround.sampleSize, '90th percentile of the same sample'],
      ['Update discipline (days)', m.updateDiscipline.numerator, m.updateDiscipline.denominator, pct(m.updateDiscipline.percentage), m.updateDiscipline.eligibleDays, 'Eligible assigned-work days with a meaningful update / eligible assigned-work days'],
      ['Planned utilisation (min)', m.plannedUtilisation.allocatedMinutes, m.plannedUtilisation.availableMinutes, pct(m.plannedUtilisation.percentage), m.plannedUtilisation.availableMinutes, 'Allocated remaining effort / available capacity'],
      ['Rework effort (min)', m.reworkEffort.reworkMinutes, m.reworkEffort.totalMinutes, pct(m.reworkEffort.percentage), m.reworkEffort.entries, 'Recorded REWORK time / all recorded time in the period'],
      ['Scope changes', m.scopeChanges.count, '', '', m.scopeChanges.count, `Estimate revisions in the period (net ${m.scopeChanges.netEstimateMinutes} min); reported separately from rework`],
      ['Legacy accepted, unverified', m.legacyUnverified.count, '', '', m.legacyUnverified.count, 'Accepted with no recorded submission; excluded from quality metrics, not back-filled'],
      [],
      ['Reconciliation', m.reconciliation.consistent ? 'OK' : 'MISMATCH', `${Object.entries(m.reconciliation.statusBreakdown).map(([k, v]) => `${k}=${v}`).join(' ')} total=${m.reconciliation.topLevelTotal}`],
      [],
      ['Metric', 'Task ref', 'Title', 'Status', 'Task id'],
      ...drill('Open tasks', m.openTasks.taskIds),
      ...drill('Overdue commitments', m.overdueCommitments.taskIds),
      ...drill('On-time submission', m.onTimeSubmission.taskIds),
      ...drill('On-time acceptance', m.onTimeAcceptance.taskIds),
      ...drill('First-pass acceptance', m.firstPassAcceptance.taskIds),
      ...drill('Updated every eligible day', m.updateDiscipline.taskIds),
      ...drill('Returned in period', m.reworkEffort.returnedSubmissions.taskIds),
      ...drill('Legacy accepted, unverified', m.legacyUnverified.taskIds),
    ];
    return Buffer.from(`﻿${lines.map((row) => row.map(cell).join(',')).join('\r\n')}`, 'utf8');
  }

  private async taskRefs(ids: string[]): Promise<Map<string, { ref: string; title: string; status: string }>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const rows = await this.db
      .select({ id: tasks.id, number: tasks.number, title: tasks.title, status: tasks.status, prefix: projects.taskPrefix })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(inArray(tasks.id, unique));
    return new Map(rows.map((r) => [r.id, { ref: `${r.prefix}-${r.number}`, title: r.title, status: r.status }]));
  }
}
