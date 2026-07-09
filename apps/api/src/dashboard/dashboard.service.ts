import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import {
  TASK_STATUSES,
  type AdminDashboard,
  type MemberDashboard,
  type MyTaskItem,
  type StatusCounts,
  type TaskStatus,
  type UpcomingDeadline,
  type WeeklyCompletionPoint,
  type WorkloadEntry,
  type WorkspacePerformance,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { auditLogs, taskAssignees, tasks, users, workspaces } from '../database/schema';
import { AuditService } from '../audit/audit.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly workspaces: WorkspacesService,
  ) {}

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

  private async overdueCount(workspaceIds?: string[]): Promise<number> {
    const conds = [
      eq(tasks.isArchived, false),
      isNotNull(tasks.dueDate),
      lt(tasks.dueDate, new Date()),
      ne(tasks.status, 'DONE'),
    ];
    if (workspaceIds) {
      if (workspaceIds.length === 0) return 0;
      conds.push(inArray(tasks.workspaceId, workspaceIds));
    }
    const [{ c } = { c: 0 }] = await this.db.select({ c: count() }).from(tasks).where(and(...conds));
    return Number(c);
  }

  /** Tasks completed per day for the current Mon–Sun week (UTC), zero-filled. */
  private async weeklyCompletion(): Promise<WeeklyCompletionPoint[]> {
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
      .where(and(eq(tasks.isArchived, false), gte(tasks.completedAt, monday)))
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
  private async teamWorkload(): Promise<WorkloadEntry[]> {
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarKey: users.avatarKey,
        c: count(),
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(and(eq(tasks.isArchived, false), ne(tasks.status, 'DONE'), eq(users.isActive, true)))
      .groupBy(users.id, users.name, users.email, users.avatarKey)
      .orderBy(desc(count()))
      .limit(10);
    return rows.map((r) => ({
      user: { id: r.id, name: r.name, email: r.email, avatarKey: r.avatarKey },
      openTasks: Number(r.c),
    }));
  }

  /** Per-workspace task totals + completion %, with a recent-activity flag. */
  private async workspacePerformance(): Promise<WorkspacePerformance[]> {
    const [rows, activeRows] = await Promise.all([
      this.db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          color: workspaces.color,
          total: sql<number>`count(${tasks.id}) filter (where ${tasks.isArchived} = false)`,
          completed: sql<number>`count(${tasks.id}) filter (where ${tasks.isArchived} = false and ${tasks.status} = 'DONE')`,
        })
        .from(workspaces)
        .leftJoin(tasks, eq(tasks.workspaceId, workspaces.id))
        .where(eq(workspaces.isArchived, false))
        .groupBy(workspaces.id, workspaces.name, workspaces.color)
        .orderBy(asc(workspaces.name)),
      this.db
        .select({ workspaceId: auditLogs.workspaceId })
        .from(auditLogs)
        .where(sql`${auditLogs.createdAt} > now() - interval '7 days'`)
        .groupBy(auditLogs.workspaceId),
    ]);
    const activeIds = new Set(activeRows.map((r) => r.workspaceId));
    return rows.map((r) => {
      const total = Number(r.total);
      const completed = Number(r.completed);
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        totalTasks: total,
        completedTasks: completed,
        completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
        isActive: activeIds.has(r.id),
      };
    });
  }

  /** Open tasks due within the next 14 days, soonest first. */
  private async upcomingDeadlines(): Promise<UpcomingDeadline[]> {
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
        prefix: workspaces.taskPrefix,
      })
      .from(tasks)
      .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
      .where(
        and(
          eq(tasks.isArchived, false),
          ne(tasks.status, 'DONE'),
          isNotNull(tasks.dueDate),
          gte(tasks.dueDate, now),
          lt(tasks.dueDate, horizon),
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

  async admin(): Promise<AdminDashboard> {
    const [[{ totalWorkspaces } = { totalWorkspaces: 0 }], [{ totalUsers } = { totalUsers: 0 }]] =
      await Promise.all([
        this.db.select({ totalWorkspaces: count() }).from(workspaces).where(eq(workspaces.isArchived, false)),
        this.db.select({ totalUsers: count() }).from(users).where(eq(users.isActive, true)),
      ]);

    const [
      tasksByStatus,
      overdueTasks,
      recentActivity,
      activeRows,
      weeklyCompletion,
      teamWorkload,
      workspacePerformance,
      upcomingDeadlines,
    ] = await Promise.all([
      this.statusCounts(),
      this.overdueCount(),
      this.audit.globalActivity(1, 10),
      this.db
        .select({ workspaceId: auditLogs.workspaceId, c: count() })
        .from(auditLogs)
        .groupBy(auditLogs.workspaceId)
        .orderBy(desc(count()))
        .limit(1),
      this.weeklyCompletion(),
      this.teamWorkload(),
      this.workspacePerformance(),
      this.upcomingDeadlines(),
    ]);

    let mostActiveWorkspace: AdminDashboard['mostActiveWorkspace'] = null;
    if (activeRows[0]) {
      const [ws] = await this.db
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, activeRows[0].workspaceId))
        .limit(1);
      if (ws) mostActiveWorkspace = { id: ws.id, name: ws.name, activityCount: Number(activeRows[0].c) };
    }

    return {
      totalWorkspaces: Number(totalWorkspaces),
      totalUsers: Number(totalUsers),
      tasksByStatus,
      overdueTasks,
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
                dueDate: tasks.dueDate,
                workspaceId: tasks.workspaceId,
                workspaceName: workspaces.name,
                prefix: workspaces.taskPrefix,
              })
              .from(tasks)
              .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
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
            dueDate: r.dueDate ? r.dueDate.toISOString() : null,
            workspaceId: r.workspaceId,
            workspaceName: r.workspaceName,
          }));

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
      myTasks,
      myWorkspaceCount: workspaceIds.length,
      myWorkspaceTaskCount: workspaceTaskCount,
      tasksByStatus,
      recentActivity,
    };
  }
}
