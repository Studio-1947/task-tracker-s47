import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import {
  type AuthUser,
  type CreatedUserWithTempPassword,
  type CreateUserInput,
  type RemovedUser,
  type UpdateUserInput,
  type UserProjectTag,
  type UserSummary,
  type UserSession,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  projects,
  sessions,
  taskAssignees,
  tasks,
  users,
  workspaceMembers,
  workspaces,
  type UserRow,
} from '../database/schema';
import { generateTempPassword } from '../common/util/password';
import { FilesService } from '../files/files.service';

/** Postgres foreign_key_violation — raised when a row is still referenced. */
const FK_VIOLATION = '23503';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly files: FilesService,
  ) {}

  private toSummary(
    u: UserRow,
    workspaceCount?: number,
    userProjects?: UserProjectTag[],
  ): UserSummary {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as UserSummary['role'],
      avatarKey: u.avatarKey,
      designation: u.designation,
      isActive: u.isActive,
      removedAt: u.removedAt ? u.removedAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      ...(workspaceCount !== undefined ? { workspaceCount } : {}),
      ...(userProjects !== undefined ? { projects: userProjects } : {}),
    };
  }

  /**
   * Which projects each person actually has work in, keyed by user id. Derived
   * from assigned open tasks rather than workspace membership: membership grants
   * access to every project in the workspace, so it can't answer "what is this
   * person on". One grouped query for the whole directory.
   */
  private async projectTagsByUser(): Promise<Map<string, UserProjectTag[]>> {
    const rows = await this.db
      .select({
        userId: taskAssignees.userId,
        id: projects.id,
        name: projects.name,
        color: projects.color,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
        taskCount: count(),
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(tasks.isArchived, false), eq(projects.isArchived, false)))
      .groupBy(
        taskAssignees.userId,
        projects.id,
        projects.name,
        projects.color,
        projects.workspaceId,
        workspaces.name,
      );

    const byUser = new Map<string, UserProjectTag[]>();
    for (const r of rows) {
      const tag: UserProjectTag = {
        id: r.id,
        name: r.name,
        color: r.color,
        workspaceId: r.workspaceId,
        workspaceName: r.workspaceName,
        taskCount: Number(r.taskCount),
      };
      byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), tag]);
    }
    // Busiest project first, so a long list truncates to the meaningful ones.
    for (const tags of byUser.values()) {
      tags.sort((a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name));
    }
    return byUser;
  }

  async list(): Promise<UserSummary[]> {
    const [rows, counts, projectTags] = await Promise.all([
      this.db.select().from(users).orderBy(users.createdAt),
      this.db
        .select({ userId: workspaceMembers.userId, c: count() })
        .from(workspaceMembers)
        .groupBy(workspaceMembers.userId),
      this.projectTagsByUser(),
    ]);
    const countByUser = new Map(counts.map((r) => [r.userId, Number(r.c)]));
    return rows.map((u) =>
      this.toSummary(u, countByUser.get(u.id) ?? 0, projectTags.get(u.id) ?? []),
    );
  }

  async create(input: CreateUserInput): Promise<CreatedUserWithTempPassword> {
    const email = input.email.toLowerCase();
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new ConflictException('A user with this email already exists');

    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

    const created = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: input.name,
          email,
          passwordHash,
          role: input.role,
          designation: input.designation ?? null,
          mustChangePassword: true,
        })
        .returning();
      if (!user) throw new Error('Failed to create user');

      if (input.workspaceIds?.length) {
        await tx
          .insert(workspaceMembers)
          .values(input.workspaceIds.map((workspaceId) => ({ workspaceId, userId: user.id })))
          .onConflictDoNothing();
      }
      return user;
    });

    return { ...this.toSummary(created, input.workspaceIds?.length ?? 0), tempPassword };
  }

  /**
   * `actorId` is required, not optional: it is the only thing standing between an
   * admin and locking themselves — and, since every caller here is an admin, the
   * last active admin — out of the admin surface entirely.
   */
  async update(id: string, input: UpdateUserInput, actorId: string): Promise<UserSummary> {
    const [current] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!current) throw new NotFoundException('User not found');

    // Locking yourself out is never the intent behind clicking Deactivate.
    if (actorId === id) {
      if (input.isActive === false) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      if (input.role !== undefined && input.role !== current.role) {
        throw new BadRequestException('You cannot change your own role');
      }
    }

    const patch: Partial<UserRow> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.role !== undefined) patch.role = input.role;
    if (input.designation !== undefined) patch.designation = input.designation;

    const deactivating = input.isActive === false && current.isActive === true;
    if (input.isActive !== undefined) {
      patch.isActive = input.isActive;
      // Deactivation must lock the user out immediately — invalidate refresh tokens (PRD §11.2).
      if (deactivating) patch.tokenVersion = current.tokenVersion + 1;
      // Reinstating clears the removal stamp: they are a plain account again.
      // Their old workspaces and task assignments do NOT come back — removal
      // dropped those — so the UI warns before offering this on a removed user.
      if (input.isActive === true) patch.removedAt = null;
    }

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
      // The bump above makes their tokens invalid, but the session rows are what
      // the admin's Active Sessions tab reads — leaving them would show somebody
      // as signed in seconds after being locked out.
      if (deactivating) await tx.delete(sessions).where(eq(sessions.userId, id));
      return row;
    });
    return this.toSummary(updated!);
  }

  /**
   * Remove a person from the org. Their row can only be erased when nothing else
   * points at it — most people have authored a task, a comment or an audit entry,
   * and those references exist precisely so history stays readable.
   *
   * So this always performs the part that matters and always succeeds: sessions
   * killed, refresh tokens invalidated, workspace memberships dropped, task
   * assignments released, account deactivated. Then it tries to delete the row
   * outright, which succeeds for somebody added by mistake who never did anything.
   * `deleted` tells the caller which of the two happened so the UI can say so.
   */
  async remove(id: string, actorId: string): Promise<RemovedUser> {
    const [current] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!current) throw new NotFoundException('User not found');
    if (actorId === id) throw new BadRequestException('You cannot remove your own account');

    // Committed on its own: if the delete below fails on a foreign key, the
    // person must still end up locked out and off every workspace.
    await this.db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, id));
      await tx.delete(taskAssignees).where(eq(taskAssignees.userId, id));
      await tx
        .update(users)
        .set({
          isActive: false,
          // Marks this as an offboarding rather than a suspension.
          removedAt: new Date(),
          tokenVersion: current.tokenVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
    });

    try {
      await this.db.delete(users).where(eq(users.id, id));
      if (current.avatarKey) await this.files.remove(current.avatarKey).catch(() => undefined);
      return { id, deleted: true };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== FK_VIOLATION) throw err;
      // Expected for anyone with history — they are offboarded, the row stays.
      this.logger.log(`Kept user row ${id}: still referenced by existing records`);
      return { id, deleted: false };
    }
  }

  /** Reset a user's password to a fresh temp password (admin-driven, PRD §11.1). */
  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const [current] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!current) throw new NotFoundException('User not found');

    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          tokenVersion: current.tokenVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
      // A reset signs them out everywhere; drop the rows so the Active Sessions
      // tab doesn't keep listing devices whose tokens no longer work.
      await tx.delete(sessions).where(eq(sessions.userId, id));
    });
    return { tempPassword };
  }

  private toAuthUser(u: UserRow): AuthUser {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as AuthUser['role'],
      avatarKey: u.avatarKey,
      designation: u.designation,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
    };
  }

  /** Self-service: set the caller's profile picture. */
  async setAvatar(userId: string, file: Express.Multer.File): Promise<AuthUser> {
    const [current] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!current) throw new NotFoundException('User not found');

    const saved = await this.files.save('avatars', file);
    const [updated] = await this.db
      .update(users)
      .set({ avatarKey: saved.key, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    // Best-effort cleanup of the previous picture; the DB row is the source of truth.
    if (current.avatarKey) await this.files.remove(current.avatarKey).catch(() => undefined);
    return this.toAuthUser(updated!);
  }

  /** Self-service: remove the caller's profile picture. */
  async removeAvatar(userId: string): Promise<AuthUser> {
    const [current] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!current) throw new NotFoundException('User not found');

    const [updated] = await this.db
      .update(users)
      .set({ avatarKey: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (current.avatarKey) await this.files.remove(current.avatarKey).catch(() => undefined);
    return this.toAuthUser(updated!);
  }

  async assertUsersExist(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, ids), eq(users.isActive, true)));
    if (found.length !== new Set(ids).size) {
      throw new NotFoundException('One or more users not found or inactive');
    }
  }

  async listSessions(): Promise<UserSession[]> {
    const rows = await this.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        userName: users.name,
        userEmail: users.email,
        userAvatarKey: users.avatarKey,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        lastActiveAt: sessions.lastActiveAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .orderBy(desc(sessions.lastActiveAt));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      userAvatarKey: r.userAvatarKey,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      lastActiveAt: r.lastActiveAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async revokeSession(id: string): Promise<{ id: string }> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
    return { id };
  }
}
