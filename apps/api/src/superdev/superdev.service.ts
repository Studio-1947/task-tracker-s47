import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type {
  CreateUserInput,
  CreatedUserWithTempPassword,
  CreateWorkspaceInput,
  WorkspaceSummary,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { generateTempPassword } from '../common/util/password';
import {
  auditLogs,
  projects,
  sessions,
  tasks,
  users,
  workspaces,
} from '../database/schema';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ErrorLogService } from './error-log.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SystemOverview {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  uptimeSeconds: number;
  nodeVersion: string;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  counts: {
    users: number;
    activeUsers: number;
    admins: number;
    workspaces: number;
    projects: number;
    tasks: number;
    activeSessions: number;
  };
  errors: { last24h: number; unresolved: number };
  generatedAt: string;
}

@Injectable()
export class SuperDevService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly errors: ErrorLogService,
    private readonly usersService: UsersService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  // ---- Overview / health -------------------------------------------------

  async overview(): Promise<SystemOverview> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      db = 'down';
    }

    const [userStats] = await this.db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${users.isActive})`,
        admins: sql<number>`count(*) filter (where ${users.role} = 'ADMIN')`,
      })
      .from(users);

    const [[ws], [pr], [tk], [ss]] = await Promise.all([
      this.db.select({ value: count() }).from(workspaces),
      this.db.select({ value: count() }).from(projects),
      this.db.select({ value: count() }).from(tasks),
      this.db.select({ value: count() }).from(sessions),
    ]);

    const mem = process.memoryUsage();
    const [errors24h, unresolved] = await Promise.all([
      this.errors.countSince(new Date(Date.now() - DAY_MS)),
      this.errors.unresolvedCount(),
    ]);

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memory: {
        rssMb: Math.round(mem.rss / 1_048_576),
        heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
        heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
      },
      counts: {
        users: Number(userStats?.total ?? 0),
        activeUsers: Number(userStats?.active ?? 0),
        admins: Number(userStats?.admins ?? 0),
        workspaces: Number(ws?.value ?? 0),
        projects: Number(pr?.value ?? 0),
        tasks: Number(tk?.value ?? 0),
        activeSessions: Number(ss?.value ?? 0),
      },
      errors: { last24h: errors24h, unresolved },
      generatedAt: new Date().toISOString(),
    };
  }

  // ---- Activity firehose -------------------------------------------------

  async activity(opts: {
    page?: number;
    pageSize?: number;
    action?: string;
    userId?: string;
    workspaceId?: string;
  }): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 30));

    const conds = [];
    if (opts.action) conds.push(eq(auditLogs.action, opts.action as never));
    if (opts.userId) conds.push(eq(auditLogs.userId, opts.userId));
    if (opts.workspaceId) conds.push(eq(auditLogs.workspaceId, opts.workspaceId));
    const where = conds.length ? and(...conds) : undefined;

    const items = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
        beforeValue: auditLogs.beforeValue,
        afterValue: auditLogs.afterValue,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        workspaceId: auditLogs.workspaceId,
        workspaceName: workspaces.name,
        taskId: auditLogs.taskId,
        taskNumber: tasks.number,
        taskTitle: tasks.title,
        taskPrefix: projects.taskPrefix,
      })
      .from(auditLogs)
      .innerJoin(users, eq(users.id, auditLogs.userId))
      .leftJoin(workspaces, eq(workspaces.id, auditLogs.workspaceId))
      .leftJoin(tasks, eq(tasks.id, auditLogs.taskId))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ value: total }] = await this.db.select({ value: count() }).from(auditLogs).where(where);

    const shaped = items.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      user: { id: r.userId, name: r.userName, email: r.userEmail },
      workspace: r.workspaceId ? { id: r.workspaceId, name: r.workspaceName } : null,
      taskRef: r.taskPrefix && r.taskNumber !== null ? `${r.taskPrefix}-${r.taskNumber}` : null,
      taskTitle: r.taskTitle,
      beforeValue: r.beforeValue,
      afterValue: r.afterValue,
    }));

    return { items: shaped, total: Number(total), page, pageSize };
  }

  // ---- God-mode: users ---------------------------------------------------

  async listUsers(): Promise<unknown[]> {
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        designation: users.designation,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        tokenVersion: users.tokenVersion,
        createdAt: users.createdAt,
        sessionCount: sql<number>`(select count(*) from ${sessions} s where s.user_id = ${users.id})`,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      sessionCount: Number(r.sessionCount),
    }));
  }

  /** Create any user, including ADMINs — returns the one-time temp password. */
  createUser(input: CreateUserInput): Promise<CreatedUserWithTempPassword> {
    return this.usersService.create(input);
  }

  async updateUser(
    id: string,
    patch: { name?: string; role?: string; isActive?: boolean; designation?: string | null },
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.designation !== undefined) set.designation = patch.designation;
    if (patch.role !== undefined) {
      if (patch.role !== 'ADMIN' && patch.role !== 'MEMBER') throw new BadRequestException('Invalid role');
      set.role = patch.role;
    }
    if (patch.isActive !== undefined) {
      set.isActive = patch.isActive;
      // Deactivating (or reactivating) invalidates outstanding tokens immediately.
      set.tokenVersion = sql`${users.tokenVersion} + 1`;
    }
    const [row] = await this.db.update(users).set(set).where(eq(users.id, id)).returning({ id: users.id });
    if (!row) throw new NotFoundException('User not found');
  }

  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new NotFoundException('User not found');
    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
    return { tempPassword };
  }

  /** Force logout everywhere by bumping tokenVersion and dropping all sessions. */
  async forceLogout(id: string): Promise<void> {
    const [row] = await this.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (!row) throw new NotFoundException('User not found');
    await this.db.delete(sessions).where(eq(sessions.userId, id));
  }

  // ---- God-mode: workspaces ---------------------------------------------

  /**
   * Create a workspace. Workspaces require an owner (createdById → users FK), so
   * super-dev must attribute it to a real user: an explicit ownerId, else the first
   * active admin.
   */
  async createWorkspace(input: CreateWorkspaceInput, ownerId?: string): Promise<WorkspaceSummary> {
    let creatorId = ownerId;
    if (creatorId) {
      const [owner] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, creatorId)).limit(1);
      if (!owner) throw new BadRequestException('ownerId does not match any user');
    } else {
      const [admin] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)))
        .orderBy(users.createdAt)
        .limit(1);
      if (!admin) throw new BadRequestException('No active admin to own the workspace; specify an owner');
      creatorId = admin.id;
    }
    return this.workspacesService.create(input, creatorId);
  }

  async listWorkspaces(): Promise<unknown[]> {
    const rows = await this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        isArchived: workspaces.isArchived,
        createdAt: workspaces.createdAt,
        memberCount: sql<number>`(select count(*) from workspace_members m where m.workspace_id = ${workspaces.id})`,
        projectCount: sql<number>`(select count(*) from ${projects} p where p.workspace_id = ${workspaces.id})`,
        taskCount: sql<number>`(select count(*) from ${tasks} t where t.workspace_id = ${workspaces.id})`,
      })
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt));
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      memberCount: Number(r.memberCount),
      projectCount: Number(r.projectCount),
      taskCount: Number(r.taskCount),
    }));
  }

  async setWorkspaceArchived(id: string, isArchived: boolean): Promise<void> {
    const [row] = await this.db
      .update(workspaces)
      .set({ isArchived, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning({ id: workspaces.id });
    if (!row) throw new NotFoundException('Workspace not found');
  }

  /** Hard delete a workspace (cascades to projects/tasks/audit via FK). Irreversible. */
  async deleteWorkspace(id: string): Promise<void> {
    const [row] = await this.db.delete(workspaces).where(eq(workspaces.id, id)).returning({ id: workspaces.id });
    if (!row) throw new NotFoundException('Workspace not found');
  }
}
