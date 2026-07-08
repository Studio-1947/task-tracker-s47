import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import type { AuditAction } from '@task-tracker/shared';
import type { AuditEntry, UserRef } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { auditLogs, tasks, users, workspaces } from '../database/schema';

export interface RecordAuditInput {
  workspaceId: string;
  taskId?: string | null;
  userId: string;
  action: AuditAction;
  beforeValue?: unknown;
  afterValue?: unknown;
}

/** Anything with `.insert()` — the root db or a transaction handle. */
type Executor = Pick<Database, 'insert'>;

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Append one immutable audit row (PRD §3.5 / §7). Accepts an optional executor
   * so callers can record inside the SAME transaction as the mutation — that's how
   * we guarantee "exactly one audit row per mutation" atomically.
   */
  async record(input: RecordAuditInput, exec: Executor = this.db): Promise<void> {
    await exec.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      taskId: input.taskId ?? null,
      userId: input.userId,
      action: input.action,
      beforeValue: input.beforeValue ?? null,
      afterValue: input.afterValue ?? null,
    });
  }

  private toEntry(row: {
    id: string;
    action: string;
    taskId: string | null;
    taskNumber: number | null;
    taskPrefix: string | null;
    beforeValue: unknown;
    afterValue: unknown;
    createdAt: Date;
    userId: string;
    userName: string;
    userEmail: string;
  }): AuditEntry {
    const user: UserRef = { id: row.userId, name: row.userName, email: row.userEmail };
    const taskRef =
      row.taskPrefix && row.taskNumber !== null ? `${row.taskPrefix}-${row.taskNumber}` : null;
    return {
      id: row.id,
      action: row.action as AuditAction,
      taskId: row.taskId,
      taskRef,
      user,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private baseSelect() {
    return this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        taskId: auditLogs.taskId,
        taskNumber: tasks.number,
        taskPrefix: workspaces.taskPrefix,
        beforeValue: auditLogs.beforeValue,
        afterValue: auditLogs.afterValue,
        createdAt: auditLogs.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .innerJoin(users, eq(users.id, auditLogs.userId))
      .innerJoin(workspaces, eq(workspaces.id, auditLogs.workspaceId))
      .leftJoin(tasks, eq(tasks.id, auditLogs.taskId));
  }

  /** Timeline for a single task (newest first). */
  async taskHistory(taskId: string): Promise<AuditEntry[]> {
    const rows = await this.baseSelect().where(eq(auditLogs.taskId, taskId)).orderBy(desc(auditLogs.createdAt));
    return rows.map((r) => this.toEntry(r));
  }

  /** Workspace-scoped activity feed (newest first, paginated). */
  async workspaceActivity(workspaceId: string, page = 1, pageSize = 50): Promise<AuditEntry[]> {
    const rows = await this.baseSelect()
      .where(eq(auditLogs.workspaceId, workspaceId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return rows.map((r) => this.toEntry(r));
  }

  /** Cross-workspace feed for the admin dashboard. */
  async globalActivity(page = 1, pageSize = 50): Promise<AuditEntry[]> {
    const rows = await this.baseSelect()
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return rows.map((r) => this.toEntry(r));
  }

  /** Helper for scoped queries when a member requests activity. */
  async workspaceActivityFor(
    workspaceIds: string[],
    page = 1,
    pageSize = 50,
  ): Promise<AuditEntry[]> {
    if (workspaceIds.length === 0) return [];
    const rows = await this.baseSelect()
      .where(inArray(auditLogs.workspaceId, workspaceIds))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return rows.map((r) => this.toEntry(r));
  }
}
