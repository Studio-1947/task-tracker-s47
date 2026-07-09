import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';
import {
  Role,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type UpdateWorkspaceMembersInput,
  type WorkspaceSummary,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { projects, users, workspaceMembers, workspaces, type WorkspaceRow } from '../database/schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly usersService: UsersService,
  ) {}

  private toSummary(w: WorkspaceRow, memberCount?: number, projectCount?: number): WorkspaceSummary {
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      color: w.color,
      isArchived: w.isArchived,
      createdAt: w.createdAt.toISOString(),
      ...(memberCount !== undefined ? { memberCount } : {}),
      ...(projectCount !== undefined ? { projectCount } : {}),
    };
  }

  /** Derive a task prefix from a name when not supplied, e.g. "Engineering" -> "ENG". */
  private derivePrefix(name: string): string {
    const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    return (letters.slice(0, 3) || 'WS').padEnd(2, 'X');
  }

  /** Returns workspace ids the given user belongs to. */
  async membershipIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));
    return rows.map((r) => r.id);
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);
    return !!row;
  }

  /** Throws unless the actor is ADMIN or a member of the workspace. */
  async assertCanAccess(workspaceId: string, actor: { id: string; role: string }): Promise<void> {
    if (actor.role === Role.ADMIN) return;
    if (!(await this.isMember(workspaceId, actor.id))) {
      throw new ForbiddenException('You do not have access to this workspace');
    }
  }

  async list(actor: { id: string; role: string }): Promise<WorkspaceSummary[]> {
    const [memberCounts, projectCounts] = await Promise.all([
      this.db
        .select({ workspaceId: workspaceMembers.workspaceId, c: count() })
        .from(workspaceMembers)
        .groupBy(workspaceMembers.workspaceId),
      this.db
        .select({ workspaceId: projects.workspaceId, c: count() })
        .from(projects)
        .where(eq(projects.isArchived, false))
        .groupBy(projects.workspaceId),
    ]);
    const countByWs = new Map(memberCounts.map((r) => [r.workspaceId, Number(r.c)]));
    const projectByWs = new Map(projectCounts.map((r) => [r.workspaceId, Number(r.c)]));

    if (actor.role === Role.ADMIN) {
      const rows = await this.db.select().from(workspaces).orderBy(workspaces.createdAt);
      return rows.map((w) => this.toSummary(w, countByWs.get(w.id) ?? 0, projectByWs.get(w.id) ?? 0));
    }

    const ids = await this.membershipIds(actor.id);
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(workspaces)
      .where(and(inArray(workspaces.id, ids), eq(workspaces.isArchived, false)));
    return rows.map((w) => this.toSummary(w, countByWs.get(w.id) ?? 0, projectByWs.get(w.id) ?? 0));
  }

  async getOne(id: string, actor: { id: string; role: string }): Promise<WorkspaceSummary> {
    await this.assertCanAccess(id, actor);
    const [w] = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!w) throw new NotFoundException('Workspace not found');
    const [[{ c: memberCount } = { c: 0 }], [{ c: projectCount } = { c: 0 }]] = await Promise.all([
      this.db.select({ c: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, id)),
      this.db
        .select({ c: count() })
        .from(projects)
        .where(and(eq(projects.workspaceId, id), eq(projects.isArchived, false))),
    ]);
    return this.toSummary(w, Number(memberCount), Number(projectCount));
  }

  async create(input: CreateWorkspaceInput, createdById: string): Promise<WorkspaceSummary> {
    const w = await this.db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
          createdById,
        })
        .returning();
      if (!workspace) throw new Error('Failed to create workspace');
      // Every workspace starts with a default "General" project so quick-add
      // always has a target and task refs are always project-scoped.
      await tx.insert(projects).values({
        workspaceId: workspace.id,
        name: 'General',
        color: input.color ?? null,
        taskPrefix: input.taskPrefix ?? this.derivePrefix(input.name),
        createdById,
      });
      return workspace;
    });
    return this.toSummary(w, 0, 1);
  }

  async update(id: string, input: UpdateWorkspaceInput): Promise<WorkspaceSummary> {
    const [current] = await this.db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!current) throw new NotFoundException('Workspace not found');
    const [w] = await this.db
      .update(workspaces)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return this.toSummary(w!);
  }

  async listMembers(id: string, actor: { id: string; role: string }) {
    await this.assertCanAccess(id, actor);
    return this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarKey: users.avatarKey,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, id));
  }

  async updateMembers(id: string, input: UpdateWorkspaceMembersInput): Promise<{ memberCount: number }> {
    const [ws] = await this.db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!ws) throw new NotFoundException('Workspace not found');

    await this.usersService.assertUsersExist([...(input.add ?? [])]);

    await this.db.transaction(async (tx) => {
      if (input.add?.length) {
        await tx
          .insert(workspaceMembers)
          .values(input.add.map((userId) => ({ workspaceId: id, userId })))
          .onConflictDoNothing();
      }
      if (input.remove?.length) {
        await tx
          .delete(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, id), inArray(workspaceMembers.userId, input.remove)));
      }
    });

    const [{ c } = { c: 0 }] = await this.db
      .select({ c: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, id));
    return { memberCount: Number(c) };
  }
}
