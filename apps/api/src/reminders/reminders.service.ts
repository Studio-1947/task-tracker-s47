import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, isNull, lte, ne } from 'drizzle-orm';
import { NotificationType, workingMinutesElapsed } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { organisationPolicies, projects, reminderDispatches, taskBlockers, taskSubmissions, tasks } from '../database/schema';
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
  async dispatchOnce(): Promise<{ dispatched: number }> {
    const [policy] = await this.db.select().from(organisationPolicies).where(eq(organisationPolicies.id, 1));
    const calendar = await this.calendar.get();
    if (!policy || !calendar.settings) return { dispatched: 0 };

    const now = new Date();
    // Working-hours gate: a reminder tick outside scheduled hours (weekend,
    // holiday, after-hours) sends nothing this pass — it'll catch up on the
    // next in-hours tick, matching "no reminders outside working intervals".
    const isWorkingNow = workingMinutesElapsed(
      new Date(now.getTime() - 1).toISOString(),
      now.toISOString(),
      calendar.settings,
      calendar.exceptions,
    ) > 0;
    if (!isWorkingNow) return { dispatched: 0 };

    let dispatched = 0;
    dispatched += await this.dispatchDeadlineReminders(policy.deadlineLeadMinutes);
    dispatched += await this.dispatchReviewOverdueReminders(policy.reviewTargetMinutes, calendar);
    dispatched += await this.dispatchBlockerFollowUps();
    return { dispatched };
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
