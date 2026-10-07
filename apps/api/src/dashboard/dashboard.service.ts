import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm';
import {
  TASK_STATUSES,
  workingDayUnits,
  workingMinutesElapsed,
  type AdminDashboard,
  type MemberDashboard,
  type MyTaskItem,
  type OverdueTaskRow,
  type StatusCounts,
  type TaskStatus,
  type UpcomingDeadline,
  type WeeklyCompletionPoint,
  type WorkloadEntry,
  type WorkspacePerformance,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  auditLogs,
  projects,
  reportSnapshots,
  taskAssignees,
  taskBlockers,
  taskSubmissions,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '../database/schema';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RemindersService } from '../reminders/reminders.service';

/** Overdue-tasks scope shared by the headline count, the drill-down list and (eventually) exports — PRD §10/§12 D01. */
const OVERDUE_LIST_LIMIT = 20;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly workspaces: WorkspacesService,
    private readonly calendar: CalendarService,
    private readonly notifications: NotificationsService,
    private readonly reminders: RemindersService,
  ) {}

  private async assertReportManager(workspaceId: string, actor: { id: string; role: string }) {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    if (actor.role !== 'ADMIN' && !(await this.workspaces.isManager(workspaceId, actor))) {
      throw new ForbiddenException(
        'Only an administrator or workspace manager can approve and distribute reports',
      );
    }
  }

  private async workspaceName(workspaceId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!row) throw new NotFoundException('Workspace not found');
    return row.name;
  }

  private reportMarkdown(
    title: string,
    workspaceName: string,
    generatedAt: string,
    sections: Array<[string, unknown[]]>,
    notes: string,
  ) {
    const lines = [
      `# ${title}`,
      '',
      `Workspace: ${workspaceName}`,
      `Generated: ${generatedAt}`,
      'Scope: active tasks in this workspace',
      'Metric version: 1.0',
      '',
    ];
    for (const [heading, rows] of sections) {
      lines.push(`## ${heading}`, '');
      if (rows.length)
        lines.push(
          ...rows.map((row: any) => `- ${row.ref ? `${row.ref}: ` : ''}${row.title ?? row.id}`),
        );
      else lines.push('- None');
      lines.push('');
    }
    lines.push(notes);
    return lines.join('\n');
  }

  private emptyStatusCounts(): StatusCounts {
    return Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as StatusCounts;
  }

  /** tasksByStatus over active tasks, optionally scoped to a set of workspaces. */
  private async statusCounts(workspaceIds?: string[]): Promise<StatusCounts> {
    const conds = [eq(tasks.isArchived, false)];
    if (workspaceIds) {
      if (workspaceIds.length === 0) return this.emptyStatusCounts();
      conds.push(inArray(tasks.workspaceId, workspaceIds));
    }
    const rows = await this.db
      .select({ status: tasks.status, c: count() })
      .from(tasks)
      .where(and(...conds))
      .groupBy(tasks.status);
    const result = this.emptyStatusCounts();
    for (const r of rows) result[r.status as TaskStatus] = Number(r.c);
    return result;
  }

  /**
   * The one query behind both the "Overdue tasks" headline count and its
   * drill-down list (PRD §10/§12 D01): a window `count(*) over()` alongside
   * the page of rows, from a single execution, so the two numbers can never
   * disagree the way the source spec's "13 overdue in headline and 0 in
   * at-risk panel" finding described.
   */
  private async overdueSummary(
    workspaceIds?: string[],
  ): Promise<{ total: number; items: OverdueTaskRow[] }> {
    if (workspaceIds && workspaceIds.length === 0) return { total: 0, items: [] };
    const conds = [
      eq(tasks.isArchived, false),
      isNotNull(tasks.dueDate),
      lt(tasks.dueDate, new Date()),
      ne(tasks.status, 'DONE'),
    ];
    if (workspaceIds) conds.push(inArray(tasks.workspaceId, workspaceIds));

    const [rows, calendar] = await Promise.all([
      this.db
        .select({
          id: tasks.id,
          number: tasks.number,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          size: tasks.size,
          dueDate: tasks.dueDate,
          workspaceId: tasks.workspaceId,
          workspaceName: workspaces.name,
          prefix: projects.taskPrefix,
          total: sql<number>`count(*) over()`,
        })
        .from(tasks)
        .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(and(...conds))
        .orderBy(asc(tasks.dueDate))
        .limit(OVERDUE_LIST_LIMIT),
      this.calendar.get(),
    ]);

    const now = new Date();
    const items: OverdueTaskRow[] = rows.map((r) => ({
      id: r.id,
      ref: `${r.prefix}-${r.number}`,
      title: r.title,
      status: r.status as TaskStatus,
      priority: r.priority as OverdueTaskRow['priority'],
      size: r.size as import('@task-tracker/shared').TaskSize,
      dueDate: r.dueDate!.toISOString(),
      workspaceId: r.workspaceId,
      workspaceName: r.workspaceName,
      overdueWorkingMinutes: calendar.settings
        ? workingMinutesElapsed(
            r.dueDate!.toISOString(),
            now.toISOString(),
            calendar.settings,
            calendar.exceptions,
          )
        : null,
    }));
    return { total: rows.length ? Number(rows[0]!.total) : 0, items };
  }

  /** Tasks completed per day for the current Mon–Sun week (UTC), zero-filled. */
  private async weeklyCompletion(workspaceIds?: string[]): Promise<WeeklyCompletionPoint[]> {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // getUTCDay(): Sun=0..Sat=6 — shift so the week starts on Monday.
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

    const rows = await this.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${tasks.completedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        c: count(),
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.isArchived, false),
          gte(tasks.completedAt, monday),
          ...(workspaceIds ? [inArray(tasks.workspaceId, workspaceIds)] : []),
        ),
      )
      .groupBy(sql`1`);
    const byDate = new Map(rows.map((r) => [r.day, Number(r.c)]));

    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return labels.map((day, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      return { date, day, completed: byDate.get(date) ?? 0 };
    });
  }

  /** Open tasks currently assigned per user, busiest first. */
  private async teamWorkload(workspaceIds?: string[]): Promise<WorkloadEntry[]> {
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarKey: users.avatarKey,
        c: count(),
        totalEst: sql<number>`sum(
          COALESCE(
            ${tasks.currentEstimateMinutes},
            ${tasks.baselineEstimateMinutes},
            CASE ${tasks.size}
              WHEN 'MINI' THEN 10
              WHEN 'SMALL' THEN 20
              WHEN 'MEDIUM' THEN 35
              WHEN 'LARGE' THEN 75
              ELSE 0
            END
          )
        )`,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(
        and(
          eq(tasks.isArchived, false),
          ne(tasks.status, 'DONE'),
          eq(users.isActive, true),
          ...(workspaceIds ? [inArray(tasks.workspaceId, workspaceIds)] : []),
        ),
      )
      .groupBy(users.id, users.name, users.email, users.avatarKey)
      .orderBy(desc(count()))
      .limit(10);
    return rows.map((r) => ({
      user: { id: r.id, name: r.name, email: r.email, avatarKey: r.avatarKey },
      openTasks: Number(r.c),
      totalEstimatedMinutes: Number(r.totalEst ?? 0),
    }));
  }

  /** Per-workspace task totals + completion %, with a recent-activity flag. */
  private async workspacePerformance(workspaceIds?: string[]): Promise<WorkspacePerformance[]> {
    const [rows, activeRows, blockedRows, reviewRows, calendar, staleUpdates] = await Promise.all([
      this.db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          color: workspaces.color,
          total: sql<number>`count(${tasks.id}) filter (where ${tasks.isArchived} = false)`,
          completed: sql<number>`count(${tasks.id}) filter (where ${tasks.isArchived} = false and ${tasks.status} = 'DONE')`,
          open: sql<number>`count(${tasks.id}) filter (where ${tasks.isArchived} = false and ${tasks.status} <> 'DONE')`,
          inProgress: sql<number>`count(${tasks.id}) filter (where ${tasks.isArchived} = false and ${tasks.status} = 'IN_PROGRESS')`,
        })
        .from(workspaces)
        .leftJoin(tasks, eq(tasks.workspaceId, workspaces.id))
        .where(
          and(
            eq(workspaces.isArchived, false),
            ...(workspaceIds ? [inArray(workspaces.id, workspaceIds)] : []),
          ),
        )
        .groupBy(workspaces.id, workspaces.name, workspaces.color)
        .orderBy(asc(workspaces.name)),
      this.db
        .select({ workspaceId: auditLogs.workspaceId })
        .from(auditLogs)
        .where(sql`${auditLogs.createdAt} > now() - interval '7 days'`)
        .groupBy(auditLogs.workspaceId),
      this.db
        .select({ workspaceId: tasks.workspaceId, c: sql<number>`count(distinct ${tasks.id})` })
        .from(taskBlockers)
        .innerJoin(tasks, eq(tasks.id, taskBlockers.taskId))
        .where(
          and(
            isNull(taskBlockers.unblockedAt),
            eq(tasks.isArchived, false),
            ne(tasks.status, 'DONE'),
          ),
        )
        .groupBy(tasks.workspaceId),
      this.db
        .select({ workspaceId: tasks.workspaceId, c: sql<number>`count(distinct ${tasks.id})` })
        .from(taskSubmissions)
        .innerJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
        .where(and(eq(taskSubmissions.status, 'PENDING'), eq(tasks.isArchived, false)))
        .groupBy(tasks.workspaceId),
      this.calendar.get(),
      this.reminders.currentUpdateOverdue(),
    ]);
    const staleByWorkspace = new Map<string, number>();
    for (const t of staleUpdates)
      staleByWorkspace.set(t.workspaceId, (staleByWorkspace.get(t.workspaceId) ?? 0) + 1);
    const activeIds = new Set(activeRows.map((r) => r.workspaceId));
    const blocked = new Map(blockedRows.map((r) => [r.workspaceId, Number(r.c)]));
    const review = new Map(reviewRows.map((r) => [r.workspaceId, Number(r.c)]));

    // Today's date in the office timezone; a non-working day is "Weekly off" rather than "Idle".
    let weeklyOff = false;
    if (calendar.settings) {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: calendar.settings.timezone,
      }).format(new Date());
      weeklyOff =
        workingDayUnits(today, today, calendar.settings.workdays, calendar.exceptions) === 0;
    }

    return rows.map((r) => {
      const total = Number(r.total);
      const completed = Number(r.completed);
      const blockedTasks = blocked.get(r.id) ?? 0;
      const awaitingReviewTasks = review.get(r.id) ?? 0;
      const inProgressTasks = Number(r.inProgress);
      const state: WorkspacePerformance['state'] = weeklyOff
        ? 'WEEKLY_OFF'
        : blockedTasks > 0
          ? 'BLOCKED'
          : awaitingReviewTasks > 0
            ? 'AWAITING_REVIEW'
            : (staleByWorkspace.get(r.id) ?? 0) > 0
              ? 'UPDATE_OVERDUE'
              : inProgressTasks === 0
                ? 'NO_ACTIVE_WORK'
                : 'ACTIVE';
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        totalTasks: total,
        completedTasks: completed,
        completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
        isActive: activeIds.has(r.id),
        openTasks: Number(r.open),
        inProgressTasks,
        awaitingReviewTasks,
        blockedTasks,
        updateOverdueTasks: staleByWorkspace.get(r.id) ?? 0,
        state,
      };
    });
  }

  /** Open tasks due within the next 14 days, soonest first. */
  private async upcomingDeadlines(workspaceIds?: string[]): Promise<UpcomingDeadline[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86_400_000);
    const rows = await this.db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        dueDate: tasks.dueDate,
        workspaceId: tasks.workspaceId,
        workspaceName: workspaces.name,
        prefix: projects.taskPrefix,
      })
      .from(tasks)
      .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.isArchived, false),
          ne(tasks.status, 'DONE'),
          isNotNull(tasks.dueDate),
          gte(tasks.dueDate, now),
          lt(tasks.dueDate, horizon),
          ...(workspaceIds ? [inArray(tasks.workspaceId, workspaceIds)] : []),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(8);
    return rows.map((r) => ({
      id: r.id,
      ref: `${r.prefix}-${r.number}`,
      title: r.title,
      dueDate: r.dueDate!.toISOString(),
      workspaceId: r.workspaceId,
      workspaceName: r.workspaceName,
      dueInDays: Math.max(0, Math.ceil((r.dueDate!.getTime() - now.getTime()) / 86_400_000)),
    }));
  }

  async admin(selectedWorkspaceIds: string[] = []): Promise<AdminDashboard> {
    const workspaceIds = selectedWorkspaceIds.length
      ? [...new Set(selectedWorkspaceIds)]
      : undefined;
    if (workspaceIds)
      await Promise.all(workspaceIds.map((workspaceId) => this.workspaceName(workspaceId)));
    const [[{ totalWorkspaces } = { totalWorkspaces: 0 }], [{ totalUsers } = { totalUsers: 0 }]] =
      await Promise.all([
        this.db
          .select({ totalWorkspaces: count() })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.isArchived, false),
              ...(workspaceIds ? [inArray(workspaces.id, workspaceIds)] : []),
            ),
          ),
        workspaceIds
          ? this.db
              .select({ totalUsers: countDistinct(users.id) })
              .from(workspaceMembers)
              .innerJoin(users, eq(users.id, workspaceMembers.userId))
              .where(
                and(inArray(workspaceMembers.workspaceId, workspaceIds), eq(users.isActive, true)),
              )
          : this.db.select({ totalUsers: count() }).from(users).where(eq(users.isActive, true)),
      ]);

    const [
      tasksByStatus,
      overdueSummary,
      recentActivity,
      activeRows,
      weeklyCompletion,
      teamWorkload,
      workspacePerformance,
      upcomingDeadlines,
      [{ noDeadlineTasks } = { noDeadlineTasks: 0 }],
    ] = await Promise.all([
      this.statusCounts(workspaceIds),
      this.overdueSummary(workspaceIds),
      workspaceIds
        ? this.audit.workspaceActivityFor(workspaceIds, 1, 10)
        : this.audit.globalActivity(1, 10),
      this.db
        .select({ workspaceId: auditLogs.workspaceId, c: count() })
        .from(auditLogs)
        .where(workspaceIds ? inArray(auditLogs.workspaceId, workspaceIds) : undefined)
        .groupBy(auditLogs.workspaceId)
        .orderBy(desc(count()))
        .limit(1),
      this.weeklyCompletion(workspaceIds),
      this.teamWorkload(workspaceIds),
      this.workspacePerformance(workspaceIds),
      this.upcomingDeadlines(workspaceIds),
      this.db
        .select({ noDeadlineTasks: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.isArchived, false),
            ne(tasks.status, 'DONE'),
            isNull(tasks.dueDate),
            ...(workspaceIds ? [inArray(tasks.workspaceId, workspaceIds)] : [])
          )
        ),
    ]);

    let mostActiveWorkspace: AdminDashboard['mostActiveWorkspace'] = null;
    if (activeRows[0]) {
      const [ws] = await this.db
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, activeRows[0].workspaceId))
        .limit(1);
      if (ws)
        mostActiveWorkspace = { id: ws.id, name: ws.name, activityCount: Number(activeRows[0].c) };
    }

    return {
      totalWorkspaces: Number(totalWorkspaces),
      totalUsers: Number(totalUsers),
      tasksByStatus,
      noDeadlineTasks: Number(noDeadlineTasks),
      overdueTasks: overdueSummary.total,
      overdueTaskList: overdueSummary.items,
      mostActiveWorkspace,
      recentActivity,
      weeklyCompletion,
      teamWorkload,
      workspacePerformance,
      upcomingDeadlines,
    };
  }

  async member(userId: string): Promise<MemberDashboard> {
    const workspaceIds = await this.workspaces.membershipIds(userId);

    // Tasks assigned to me across my workspaces, soonest due first.
    const myTasks: MyTaskItem[] =
      workspaceIds.length === 0
        ? []
        : (
            await this.db
              .select({
                id: tasks.id,
                number: tasks.number,
                title: tasks.title,
                status: tasks.status,
                priority: tasks.priority,
                size: tasks.size,
                dueDate: tasks.dueDate,
                workspaceId: tasks.workspaceId,
                workspaceName: workspaces.name,
                prefix: projects.taskPrefix,
              })
              .from(tasks)
              .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
              .innerJoin(projects, eq(projects.id, tasks.projectId))
              .where(
                and(
                  eq(tasks.isArchived, false),
                  ne(tasks.status, 'DONE'),
                  inArray(
                    tasks.id,
                    this.db
                      .select({ id: taskAssignees.taskId })
                      .from(taskAssignees)
                      .where(eq(taskAssignees.userId, userId)),
                  ),
                ),
              )
              .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(tasks.priority))
              .limit(50)
          ).map((r) => ({
            id: r.id,
            ref: `${r.prefix}-${r.number}`,
            title: r.title,
            status: r.status as TaskStatus,
            priority: r.priority as MyTaskItem['priority'],
            size: r.size as import('@task-tracker/shared').TaskSize,
            dueDate: r.dueDate ? r.dueDate.toISOString() : null,
            workspaceId: r.workspaceId,
            workspaceName: r.workspaceName,
          }));

    const [reviewRow, blockedRow, stale] = await Promise.all([
      this.db
        .select({ c: sql<number>`count(distinct ${taskSubmissions.id})` })
        .from(taskSubmissions)
        .innerJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
        .where(
          and(
            eq(taskSubmissions.status, 'PENDING'),
            eq(tasks.reviewerId, userId),
            eq(tasks.isArchived, false),
          ),
        ),
      this.db
        .select({ c: sql<number>`count(distinct ${taskBlockers.id})` })
        .from(taskBlockers)
        .innerJoin(tasks, eq(tasks.id, taskBlockers.taskId))
        .where(
          and(
            isNull(taskBlockers.unblockedAt),
            eq(taskBlockers.unblockerUserId, userId),
            eq(tasks.isArchived, false),
            ne(tasks.status, 'DONE'),
          ),
        ),
      this.reminders.currentUpdateOverdue(),
    ]);

    const [tasksByStatus, workspaceTaskCount, recentActivity] = await Promise.all([
      this.statusCounts(workspaceIds),
      workspaceIds.length === 0
        ? Promise.resolve(0)
        : this.db
            .select({ c: count() })
            .from(tasks)
            .where(and(eq(tasks.isArchived, false), inArray(tasks.workspaceId, workspaceIds)))
            .then(([r]) => Number(r?.c ?? 0)),
      this.audit.workspaceActivityFor(workspaceIds, 1, 10),
    ]);

    return {
      reviewsWaiting: Number(reviewRow[0]?.c ?? 0),
      blockedOnMe: Number(blockedRow[0]?.c ?? 0),
      updateOverdueTaskIds: stale.filter((t) => t.ownerId === userId).map((t) => t.id),
      myTasks,
      myWorkspaceCount: workspaceIds.length,
      myWorkspaceTaskCount: workspaceTaskCount,
      tasksByStatus,
      recentActivity,
    };
  }

  // ── Wednesday & Friday Report Drafts (X01) ──

  async generateWednesdayReport(workspaceId: string, actor: { id: string; role: string }) {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const workspaceName = await this.workspaceName(workspaceId);
    const [accepted, blocked, upcoming] = await Promise.all([
      this.db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.status, 'DONE'),
            eq(tasks.isArchived, false),
          ),
        )
        .limit(20),
      this.db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.status, 'IN_PROGRESS'),
            eq(tasks.isArchived, false),
          ),
        )
        .limit(20),
      this.upcomingDeadlines(),
    ]);

    const generatedAt = new Date().toISOString();
    const summaryNotes =
      'Wednesday routine: commitments progressed, accepted deliverables, blocked work, decisions needed, next deadlines.';
    const payload = {
      reportType: 'WEDNESDAY_PROGRESS',
      generatedAt,
      reportDate: generatedAt.slice(0, 10),
      workspaceId,
      workspaceName,
      acceptedDeliverables: accepted,
      commitmentsProgressed: blocked,
      upcomingDeadlines: upcoming,
      summaryNotes,
    };
    return {
      ...payload,
      summary: payload,
      markdown: this.reportMarkdown(
        'Wednesday Mid-Week Progress',
        workspaceName,
        generatedAt,
        [
          ['Accepted deliverables', accepted],
          ['Commitments progressed', blocked],
          ['Upcoming deadlines', upcoming],
        ],
        summaryNotes,
      ),
    };
  }

  async generateFridayReport(workspaceId: string, actor: { id: string; role: string }) {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const workspaceName = await this.workspaceName(workspaceId);
    const [accepted, carryover] = await Promise.all([
      this.db
        .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.status, 'DONE'),
            eq(tasks.isArchived, false),
          ),
        )
        .limit(20),
      this.db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            ne(tasks.status, 'DONE'),
            eq(tasks.isArchived, false),
          ),
        )
        .limit(20),
    ]);

    const generatedAt = new Date().toISOString();
    const summaryNotes =
      'Friday routine: accepted outcomes, carryover with reasons, review backlog, next week capacity & priorities.';
    const payload = {
      reportType: 'FRIDAY_OUTCOMES',
      generatedAt,
      reportDate: generatedAt.slice(0, 10),
      workspaceId,
      workspaceName,
      acceptedOutcomes: accepted,
      carryoverTasks: carryover,
      summaryNotes,
    };
    return {
      ...payload,
      summary: payload,
      markdown: this.reportMarkdown(
        'Friday Outcomes',
        workspaceName,
        generatedAt,
        [
          ['Accepted outcomes', accepted],
          ['Carryover', carryover],
        ],
        summaryNotes,
      ),
    };
  }

  async createReportDraft(
    workspaceId: string,
    reportType: 'WEDNESDAY_PROGRESS' | 'FRIDAY_OUTCOMES',
    actor: { id: string; role: string },
  ) {
    await this.assertReportManager(workspaceId, actor);
    const report =
      reportType === 'WEDNESDAY_PROGRESS'
        ? await this.generateWednesdayReport(workspaceId, actor)
        : await this.generateFridayReport(workspaceId, actor);
    const [row] = await this.db
      .insert(reportSnapshots)
      .values({
        workspaceId,
        reportType,
        reportDate: report.reportDate,
        markdown: report.markdown,
        payload: report.summary,
        generatedById: actor.id,
      })
      .returning();
    return row;
  }

  async approveReport(
    reportId: string,
    recipientIds: string[] | undefined,
    actor: { id: string; role: string },
  ) {
    const [report] = await this.db
      .select()
      .from(reportSnapshots)
      .where(eq(reportSnapshots.id, reportId))
      .limit(1);
    if (!report) throw new NotFoundException('Report draft not found');
    await this.assertReportManager(report.workspaceId, actor);
    if (report.status !== 'DRAFT')
      throw new BadRequestException('Only a draft report can be approved');
    const members = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, report.workspaceId));
    const allowed = new Set(members.map((m) => m.userId));
    const recipients = recipientIds?.length ? [...new Set(recipientIds)] : [...allowed];
    if (recipients.some((id) => !allowed.has(id)))
      throw new BadRequestException('Every report recipient must belong to the workspace');
    const [updated] = await this.db
      .update(reportSnapshots)
      .set({
        status: 'APPROVED',
        recipientIds: recipients,
        approvedById: actor.id,
        approvedAt: new Date(),
      })
      .where(eq(reportSnapshots.id, reportId))
      .returning();
    return updated;
  }

  async distributeReport(reportId: string, actor: { id: string; role: string }) {
    const [report] = await this.db
      .select()
      .from(reportSnapshots)
      .where(eq(reportSnapshots.id, reportId))
      .limit(1);
    if (!report) throw new NotFoundException('Report not found');
    await this.assertReportManager(report.workspaceId, actor);
    if (report.status !== 'APPROVED')
      throw new BadRequestException('The report must be approved before distribution');
    for (const userId of report.recipientIds) {
      await this.notifications.createNotification(
        userId,
        actor.id,
        'REPORT_SHARED',
        report.reportType === 'WEDNESDAY_PROGRESS'
          ? 'Wednesday progress report'
          : 'Friday outcomes report',
        'A manager-approved workspace report is ready to review.',
        { reportId: report.id, workspaceId: report.workspaceId, reportType: report.reportType },
      );
    }
    const [updated] = await this.db
      .update(reportSnapshots)
      .set({ status: 'DISTRIBUTED', distributedAt: new Date() })
      .where(eq(reportSnapshots.id, reportId))
      .returning();
    return { ...updated, delivered: report.recipientIds.length };
  }

  async listReportSnapshots(workspaceId: string, actor: { id: string; role: string }) {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    return this.db
      .select()
      .from(reportSnapshots)
      .where(eq(reportSnapshots.workspaceId, workspaceId))
      .orderBy(desc(reportSnapshots.createdAt));
  }
}
