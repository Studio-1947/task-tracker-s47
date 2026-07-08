import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, count, eq, inArray } from 'drizzle-orm';
import type {
  CreatedUserWithTempPassword,
  CreateUserInput,
  UpdateUserInput,
  UserSummary,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { users, workspaceMembers, type UserRow } from '../database/schema';
import { generateTempPassword } from '../common/util/password';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private toSummary(u: UserRow, workspaceCount?: number): UserSummary {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as UserSummary['role'],
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      ...(workspaceCount !== undefined ? { workspaceCount } : {}),
    };
  }

  async list(): Promise<UserSummary[]> {
    const rows = await this.db.select().from(users).orderBy(users.createdAt);
    const counts = await this.db
      .select({ userId: workspaceMembers.userId, c: count() })
      .from(workspaceMembers)
      .groupBy(workspaceMembers.userId);
    const countByUser = new Map(counts.map((r) => [r.userId, Number(r.c)]));
    return rows.map((u) => this.toSummary(u, countByUser.get(u.id) ?? 0));
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

  async update(id: string, input: UpdateUserInput): Promise<UserSummary> {
    const [current] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!current) throw new NotFoundException('User not found');

    const patch: Partial<UserRow> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.role !== undefined) patch.role = input.role;
    if (input.isActive !== undefined) {
      patch.isActive = input.isActive;
      // Deactivation must lock the user out immediately — invalidate refresh tokens (PRD §11.2).
      if (input.isActive === false && current.isActive === true) {
        patch.tokenVersion = current.tokenVersion + 1;
      }
    }

    const [updated] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return this.toSummary(updated!);
  }

  /** Reset a user's password to a fresh temp password (admin-driven, PRD §11.1). */
  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const [current] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!current) throw new NotFoundException('User not found');

    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        tokenVersion: current.tokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
    return { tempPassword };
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
}
