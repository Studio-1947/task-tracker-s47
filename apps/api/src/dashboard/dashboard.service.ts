import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import {
  TASK_STATUSES,
  type AdminDashboard,
  type MemberDashboard,
  type MyTaskItem,
  type StatusCounts,
  type TaskStatus,
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

  async admin(): Promise<AdminDashboard> {
    const [[{ totalWorkspaces } = { totalWorkspaces: 0 }], [{ totalUsers } = { totalUsers: 0 }]] =
      await Promise.all([
        this.db.select({ totalWorkspaces: count() }).from(workspaces).where(eq(workspaces.isArchived, false)),
        this.db.select({ totalUsers: count() }).from(users).where(eq(users.isActive, true)),
      ]);

    const [tasksByStatus, overdueTasks, recentActivity, activeRows] = await Promise.all([
      this.statusCounts(),
      this.overdueCount(),
      this.audit.globalActivity(1, 10),
      this.db
        .select({ workspaceId: auditLogs.workspaceId, c: count() })
        .from(auditLogs)
        .groupBy(auditLogs.workspaceId)
        .orderBy(desc(count()))
        .limit(1),
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
