import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { AuditAction, NotificationType, eligibleWorkingMinutes, localMidnight, workingMinutesElapsed } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  auditLogs,
  leaveRequests,
  organisationPolicies,
  projects,
  reminderDispatches,
  taskAttachments,
  taskBlockers,
  taskComments,
  taskEstimateRevisions,
  taskSubmissions,
  taskTimeEntries,
  tasks,
  users,
} from '../database/schema';
import { CalendarService } from '../calendar/calendar.service';
import { NotificationsService } from '../notifications/notifications.service';

const DISPATCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Calendar-aware reminder dispatch worker (PRD §2 "Send normal work reminders
 * during working intervals; account for leave and holidays", §15 N01).
 * Idempotent by construction: each candidate reminder gets a stable
 * `dispatchKey`, and `reminder_dispatches` has a unique index on it, so a
 * duplicate tick (or two overlapping workers) can never send the same
 * reminder twice — the second insert simply no-ops.
 */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly calendar: CalendarService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    // Never run inside the vitest process — nothing there boots a full Nest
    // application, but this guard is a defensive backstop against a leaked
    // timer keeping a test run alive.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.dispatchOnce().catch((err) => this.logger.error(`Reminder dispatch tick failed: ${err.message}`));
    }, DISPATCH_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One dispatch pass. Exposed for the manual "run now" admin endpoint and for smoke testing without waiting on the timer. */
  async dispatchOnce(): Promise<{ dispatched: number; workingHours: boolean; byType: Record<string, number> }> {
    const [policy] = await this.db.select().from(organisationPolicies).where(eq(organisationPolicies.id, 1));
    const calendar = await this.calendar.get();
    if (!policy || !calendar.settings) return { dispatched: 0, workingHours: false, byType: {} };

    const now = new Date();
    // Working-hours gate (one-minute window: the calendar maths has minute resolution): a reminder tick outside scheduled hours (weekend,
    // holiday, after-hours) sends nothing this pass — it'll catch up on the
    // next in-hours tick, matching "no reminders outside working intervals".
    const isWorkingNow = workingMinutesElapsed(
      new Date(now.getTime() - 60_000).toISOString(),
      now.toISOString(),
      calendar.settings,
      calendar.exceptions,
    ) > 0;
    if (!isWorkingNow) return { dispatched: 0, workingHours: false, byType: {} };

    const byType: Record<string, number> = {
      [NotificationType.TASK_DUE_SOON]: await this.dispatchDeadlineReminders(policy.deadlineLeadMinutes),
      [NotificationType.REVIEW_OVERDUE]: await this.dispatchReviewOverdueReminders(policy.reviewTargetMinutes, calendar),
      [NotificationType.BLOCKER_FOLLOW_UP]: await this.dispatchBlockerFollowUps(),
      [NotificationType.UPDATE_OVERDUE]: await this.dispatchUpdateOverdueReminders(policy.updateThresholdMinutes, calendar),
    };
    return { dispatched: Object.values(byType).reduce((a, b) => a + b, 0), workingHours: true, byType };
  }

  private async tryDispatch(userId: string, taskId: string | null, reminderType: string, dispatchKey: string, title: string, message: string): Promise<boolean> {
    const [inserted] = await this.db
      .insert(reminderDispatches)
      .values({ taskId, userId, reminderType, dispatchKey })
      .onConflictDoNothing({ target: reminderDispatches.dispatchKey })
      .returning({ id: reminderDispatches.id });
    if (!inserted) return false; // already dispatched
    await this.notifications.createNotification(userId, null, reminderType as NotificationType, title, message, taskId ? { taskId } : undefined);
    return true;
  }

  /** Deadline lead reminder — owner and reviewer, once per task per due date. */
  private async dispatchDeadlineReminders(leadMinutes: number): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + leadMinutes * 60_000);
    const rows = await this.db
      .select({ id: tasks.id, number: tasks.number, title: tasks.title, dueDate: tasks.dueDate, ownerId: tasks.ownerId, reviewerId: tasks.reviewerId, prefix: projects.taskPrefix })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.isArchived, false), ne(tasks.status, 'DONE')));
    let count = 0;
    for (const r of rows) {
      if (!r.dueDate || r.dueDate < now || r.dueDate > horizon) continue;
      const ref = `${r.prefix}-${r.number}`;
      const dueKey = r.dueDate.toISOString();
      for (const userId of [r.ownerId, r.reviewerId].filter((id): id is string => !!id)) {
        const sent = await this.tryDispatch(
          userId,
          r.id,
          NotificationType.TASK_DUE_SOON,
          `DEADLINE:${r.id}:${dueKey}:${userId}`,
          'Deadline approaching',
          `Task ${ref} "${r.title}" is due soon.`,
        );
        if (sent) count += 1;
      }
    }
    return count;
  }

  /** Review-overdue reminder — the current assigned reviewer, once per pending submission. */
  private async dispatchReviewOverdueReminders(reviewTargetMinutes: number, calendar: Awaited<ReturnType<CalendarService['get']>>): Promise<number> {
    if (!calendar.settings) return 0;
    const now = new Date();
    const rows = await this.db
      .select({
        submissionId: taskSubmissions.id,
        submittedAt: taskSubmissions.submittedAt,
        taskId: tasks.id,
        number: tasks.number,
        title: tasks.title,
        reviewerId: tasks.reviewerId,
        prefix: projects.taskPrefix,
      })
      .from(taskSubmissions)
      .innerJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(taskSubmissions.status, 'PENDING'));
    let count = 0;
    for (const r of rows) {
      if (!r.reviewerId) continue;
      const waitingMinutes = workingMinutesElapsed(r.submittedAt.toISOString(), now.toISOString(), calendar.settings, calendar.exceptions);
      if (waitingMinutes < reviewTargetMinutes) continue;
      const sent = await this.tryDispatch(
        r.reviewerId,
        r.taskId,
        NotificationType.REVIEW_OVERDUE,
        `REVIEW_OVERDUE:${r.submissionId}`,
        'Review is overdue',
        `Task ${r.prefix}-${r.number} "${r.title}" has been awaiting your review past the target.`,
      );
      if (sent) count += 1;
    }
    return count;
  }

  /**
   * Update-overdue reminder (PRD §11 "Meaningful alerts"): an in-progress task
   * whose owner has not posted a real update for `thresholdMinutes` of eligible
   * working time. A status toggle alone is not an update — it only starts the
   * clock. Leave, blocked periods and time spent awaiting review are not the
   * owner's to act on, so they are excluded. One reminder per stale stretch:
   * the key embeds the last-update instant, so any genuine update resets it.
   */
  private async dispatchUpdateOverdueReminders(thresholdMinutes: number, calendar: Awaited<ReturnType<CalendarService['get']>>): Promise<number> {
    if (!calendar.settings) return 0;
    const settings = calendar.settings;
    const now = new Date();
    const candidates = await this.db
      .select({ id: tasks.id, number: tasks.number, title: tasks.title, ownerId: tasks.ownerId, createdAt: tasks.createdAt, prefix: projects.taskPrefix })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(users, eq(users.id, tasks.ownerId))
      .where(and(eq(tasks.isArchived, false), eq(tasks.status, 'IN_PROGRESS'), eq(users.isActive, true)));
    if (!candidates.length) return 0;
    const ids = candidates.map((c) => c.id);
    const ownerIds = [...new Set(candidates.map((c) => c.ownerId!))];

    const latest = async (rows: Promise<Array<{ taskId: string; at: Date | string | null }>>) =>
      new Map((await rows).filter((r) => r.at).map((r) => [r.taskId, new Date(r.at as string | Date)]));
    const [comments, entries, revisions, attachments, submissions, statusChanges, blockers, pendingSubs, leaves] = await Promise.all([
      latest(this.db.select({ taskId: taskComments.taskId, at: sql<Date>`max(${taskComments.createdAt})` }).from(taskComments).where(inArray(taskComments.taskId, ids)).groupBy(taskComments.taskId)),
      latest(this.db.select({ taskId: taskTimeEntries.taskId, at: sql<Date>`max(${taskTimeEntries.updatedAt})` }).from(taskTimeEntries).where(inArray(taskTimeEntries.taskId, ids)).groupBy(taskTimeEntries.taskId)),
      latest(this.db.select({ taskId: taskEstimateRevisions.taskId, at: sql<Date>`max(${taskEstimateRevisions.createdAt})` }).from(taskEstimateRevisions).where(inArray(taskEstimateRevisions.taskId, ids)).groupBy(taskEstimateRevisions.taskId)),
      latest(this.db.select({ taskId: taskAttachments.taskId, at: sql<Date>`max(${taskAttachments.createdAt})` }).from(taskAttachments).where(inArray(taskAttachments.taskId, ids)).groupBy(taskAttachments.taskId)),
      latest(this.db.select({ taskId: taskSubmissions.taskId, at: sql<Date>`max(${taskSubmissions.submittedAt})` }).from(taskSubmissions).where(inArray(taskSubmissions.taskId, ids)).groupBy(taskSubmissions.taskId)),
      latest(this.db.select({ taskId: auditLogs.taskId, at: sql<Date>`max(${auditLogs.createdAt})` }).from(auditLogs).where(and(inArray(auditLogs.taskId, ids), eq(auditLogs.action, AuditAction.STATUS_CHANGED))).groupBy(auditLogs.taskId) as Promise<Array<{ taskId: string; at: Date | null }>>),
      this.db.select({ taskId: taskBlockers.taskId, from: taskBlockers.blockedAt, to: taskBlockers.unblockedAt }).from(taskBlockers).where(inArray(taskBlockers.taskId, ids)),
      this.db.select({ taskId: taskSubmissions.taskId, from: taskSubmissions.submittedAt, to: taskSubmissions.decidedAt }).from(taskSubmissions).where(inArray(taskSubmissions.taskId, ids)),
      this.db.select().from(leaveRequests).where(and(inArray(leaveRequests.userId, ownerIds), eq(leaveRequests.status, 'APPROVED'))),
    ]);

    let count = 0;
    for (const c of candidates) {
      // Waiting on a blocker or on review is not an update the owner can give.
      if (blockers.some((b) => b.taskId === c.id && !b.to)) continue;
      if (pendingSubs.some((s) => s.taskId === c.id && !s.to)) continue;
      const signals = [comments, entries, revisions, attachments, submissions].map((m) => m.get(c.id)).filter((d): d is Date => !!d);
      // The clock starts at the later of the last real update and the last status change (or creation):
      // moving a task into progress starts it but does not itself count as an update.
      const baseline = statusChanges.get(c.id) ?? c.createdAt;
      const start = new Date(Math.max(baseline.getTime(), ...signals.map((d) => d.getTime())));
      const nonActionable = [
        ...blockers.filter((b) => b.taskId === c.id).map((b) => ({ start: b.from.getTime(), end: (b.to ?? now).getTime() })),
        ...pendingSubs.filter((s) => s.taskId === c.id).map((s) => ({ start: s.from.getTime(), end: (s.to ?? now).getTime() })),
        ...leaves
          .filter((l) => l.userId === c.ownerId)
          .map((l) => ({
            start: localMidnight(l.startDate, settings.timezone).getTime(),
            end: localMidnight(new Date(new Date(`${l.endDate}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10), settings.timezone).getTime(),
          })),
      ];
      const eligible = eligibleWorkingMinutes(start, now, settings, calendar.exceptions, nonActionable);
      if (eligible < thresholdMinutes) continue;
      const sent = await this.tryDispatch(
        c.ownerId!,
        c.id,
        NotificationType.UPDATE_OVERDUE,
        `UPDATE_OVERDUE:${c.id}:${start.toISOString()}:${c.ownerId}`,
        'Progress update overdue',
        `Task ${c.prefix}-${c.number} "${c.title}" has had no progress update for ${Math.round(eligible / 60)} working hours.`,
      );
      if (sent) count += 1;
    }
    return count;
  }

  /** Blocked-task follow-up reminder — the designated unblocker, once per follow-up date. */
  private async dispatchBlockerFollowUps(): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .select({
        blockerId: taskBlockers.id,
        nextFollowUpAt: taskBlockers.nextFollowUpAt,
        unblockerUserId: taskBlockers.unblockerUserId,
        taskId: tasks.id,
        number: tasks.number,
        title: tasks.title,
        prefix: projects.taskPrefix,
      })
      .from(taskBlockers)
      .innerJoin(tasks, eq(tasks.id, taskBlockers.taskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(isNull(taskBlockers.unblockedAt), lte(taskBlockers.nextFollowUpAt, now)));
    let count = 0;
    for (const r of rows) {
      if (!r.nextFollowUpAt) continue;
      const sent = await this.tryDispatch(
        r.unblockerUserId,
        r.taskId,
        NotificationType.BLOCKER_FOLLOW_UP,
        `BLOCKER_FOLLOWUP:${r.blockerId}:${r.nextFollowUpAt.toISOString()}`,
        'Blocker follow-up due',
        `Task ${r.prefix}-${r.number} "${r.title}" has a blocker follow-up due.`,
      );
      if (sent) count += 1;
    }
    return count;
  }
}
