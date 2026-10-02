import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type {
  CreateOrgPersonInput,
  MovePersonInput,
  OrgChangeItem,
  OrgTree,
  OrgTreePermissions,
  UpdateTeamInput,
} from '@task-tracker/shared';
import { UsersService } from '../users/users.service';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  clients,
  offices,
  orgChanges,
  teamMembers,
  teams,
  users,
  workspaceTeams,
  workspaces,
} from '../database/schema';

type Actor = { id: string; role: string };
type Person = { id: string; reportsToId: string | null };

/** Everyone who reports to `rootId`, directly or through others. Tolerates loops in bad data. */
function subtreeOf(rootId: string, people: Person[]): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const p of people)
    if (p.reportsToId) byParent.set(p.reportsToId, [...(byParent.get(p.reportsToId) ?? []), p.id]);
  const out = new Set<string>();
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id) || id === rootId) continue;
    out.add(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}
const KINDS = ['offices', 'clients', 'teams'] as const;

/** Postgres reports a duplicate as SQLSTATE 23505, either on the error or wrapped in `cause`. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
}

@Injectable()
export class OrganisationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly usersService: UsersService,
  ) {}
  private assertKind(kind: string): asserts kind is (typeof KINDS)[number] {
    if (!(KINDS as readonly string[]).includes(kind))
      throw new BadRequestException(`Unknown directory "${kind}"; use offices, clients or teams`);
  }

  list(kind: string) {
    this.assertKind(kind);
    const table = kind === 'offices' ? offices : kind === 'clients' ? clients : teams;
    return this.db.select().from(table).orderBy(asc(table.name));
  }

  async create(kind: string, input: { name: string; timezone?: string }) {
    this.assertKind(kind);
    const name = input.name.trim();
    try {
      if (kind === 'offices')
        return (
          await this.db
            .insert(offices)
            .values({ name, timezone: input.timezone ?? 'Asia/Kolkata' })
            .returning()
        )[0];
      if (kind === 'clients')
        return (await this.db.insert(clients).values({ name }).returning())[0];
      return (await this.db.insert(teams).values({ name }).returning())[0];
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException(`A ${kind.slice(0, -1)} named "${name}" already exists`);
      throw e;
    }
  }

  /** Everyone signed in may see the tree: names, titles and photos only (no email, role or workspace data). */
  async tree(actor: Actor): Promise<OrgTree> {
    const teamRows = await this.db
      .select()
      .from(teams)
      .where(eq(teams.isArchived, false))
      .orderBy(asc(teams.name));
    const links = await this.db.select().from(teamMembers);
    const people = await this.db
      .select({
        id: users.id,
        name: users.name,
        designation: users.designation,
        avatarKey: users.avatarKey,
        reportsToId: users.reportsToId,
        isTop: users.orgTop,
      })
      .from(users)
      .where(and(eq(users.isActive, true)))
      .orderBy(asc(users.name));
    const live = new Set(teamRows.map((t) => t.id));
    const active = new Set(people.map((p) => p.id));
    const cleanPeople = people.map((p) => ({
      ...p,
      reportsToId: p.reportsToId && active.has(p.reportsToId) ? p.reportsToId : null,
    }));
    const outTeams = teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      parentTeamId: t.parentTeamId && live.has(t.parentTeamId) ? t.parentTeamId : null,
      managerId: t.managerId && active.has(t.managerId) ? t.managerId : null,
      memberIds: links
        .filter((l) => l.teamId === t.id && active.has(l.userId))
        .map((l) => l.userId),
    }));
    return {
      teams: outTeams,
      people: cleanPeople,
      permissions: this.permissionsFor(actor, cleanPeople, outTeams),
    };
  }

  /** What this viewer may change. Computed here so the screen only mirrors, never decides. */
  private permissionsFor(
    actor: Actor,
    people: Person[],
    teamList: Array<{ id: string; managerId: string | null }>,
  ): OrgTreePermissions {
    if (actor.role === 'ADMIN') {
      return {
        level: 'ADMIN',
        manageablePersonIds: people.map((p) => p.id),
        manageableTeamIds: teamList.map((t) => t.id),
        canPlaceTopLevel: true,
        canCreatePeople: true,
      };
    }
    const sub = subtreeOf(actor.id, people);
    const myTeams = teamList.filter((t) => t.managerId === actor.id).map((t) => t.id);
    return {
      level: sub.size > 0 || myTeams.length > 0 ? 'MANAGER' : 'VIEWER',
      manageablePersonIds: [...sub],
      manageableTeamIds: myTeams,
      canPlaceTopLevel: false,
      canCreatePeople: false,
    };
  }

  private async log(
    actorId: string,
    kind: string,
    subjectId: string | null,
    before: unknown,
    after: unknown,
  ) {
    await this.db
      .insert(orgChanges)
      .values({
        actorId,
        kind,
        subjectId,
        beforeValue: before as never,
        afterValue: after as never,
      });
  }

  /** A reporting-line move into a team also gives the person that team's membership.
   * This keeps the People chart and Team chart from telling contradictory stories. */
  private async inheritManagerTeams(personId: string, managerId: string): Promise<string[]> {
    const [ledTeams, membershipTeams] = await Promise.all([
      this.db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.managerId, managerId), eq(teams.isArchived, false))),
      this.db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, managerId)),
    ]);
    const teamIds = [
      ...new Set([
        ...ledTeams.map((team) => team.id),
        ...membershipTeams.map((team) => team.teamId),
      ]),
    ];
    if (teamIds.length) {
      await this.db
        .insert(teamMembers)
        .values(teamIds.map((teamId) => ({ teamId, userId: personId })))
        .onConflictDoNothing();
    }
    return teamIds;
  }

  /** Move a person under a different manager and/or change their title. Admin: anyone. Manager: only people below them, and only to a place below them. */
  async movePerson(actor: Actor, personId: string, input: MovePersonInput) {
    const all = await this.db
      .select({
        id: users.id,
        name: users.name,
        reportsToId: users.reportsToId,
        designation: users.designation,
        isActive: users.isActive,
      })
      .from(users);
    const person = all.find((u) => u.id === personId && u.isActive);
    if (!person) throw new NotFoundException('Person not found');
    const isAdmin = actor.role === 'ADMIN';
    const mine = isAdmin ? null : subtreeOf(actor.id, all);
    if (!isAdmin && !mine!.has(personId))
      throw new ForbiddenException('You can only change people who report to you');

    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.reportsToId !== undefined) {
      const target = input.reportsToId;
      if (target === null) {
        if (!isAdmin)
          throw new ForbiddenException('Only an admin can take someone to the top of the chart');
      } else {
        const parent = all.find((u) => u.id === target && u.isActive);
        if (!parent) throw new BadRequestException('That manager was not found');
        if (target === personId) throw new BadRequestException('Nobody can report to themselves');
        if (subtreeOf(personId, all).has(target))
          throw new BadRequestException('That would put someone under their own report');
        if (!isAdmin && target !== actor.id && !mine!.has(target))
          throw new ForbiddenException('You can only place people under yourself or your own team');
      }
      patch.reportsToId = target;
      // Placing someone at the top marks them as the head of the chart; giving them a manager clears it.
      patch.orgTop = target === null;
    }
    if (input.designation !== undefined)
      patch.designation =
        input.designation === null || input.designation.trim() === ''
          ? null
          : input.designation.trim();
    if (Object.keys(patch).length === 0)
      return { id: personId, reportsToId: person.reportsToId, designation: person.designation };

    const [row] = await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, personId))
      .returning({ id: users.id, reportsToId: users.reportsToId, designation: users.designation });
    const inheritedTeamIds = input.reportsToId
      ? await this.inheritManagerTeams(personId, input.reportsToId)
      : [];
    await this.log(
      actor.id,
      'PERSON_MOVED',
      personId,
      { reportsToId: person.reportsToId, designation: person.designation },
      { reportsToId: row!.reportsToId, designation: row!.designation, inheritedTeamIds },
    );
    return row!;
  }

  /** Admin only: create the account (temporary password, first-login change) and place it in the chart. */
  async createPerson(actor: Actor, input: CreateOrgPersonInput) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Only an admin can add people');
    if (input.reportsToId) {
      const [boss] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.reportsToId), eq(users.isActive, true)));
      if (!boss) throw new BadRequestException('That manager was not found');
    }
    const created = await this.usersService.create({
      name: input.name,
      email: input.email,
      role: 'MEMBER',
      designation: input.designation,
      gender: 'UNSPECIFIED',
    });
    // A manager places them under that person; an explicit `null` puts them at the top of the chart; leaving it out keeps them off the chart.
    if (input.reportsToId) {
      await this.db
        .update(users)
        .set({ reportsToId: input.reportsToId })
        .where(eq(users.id, created.id));
      await this.inheritManagerTeams(created.id, input.reportsToId);
    } else if (input.reportsToId === null)
      await this.db.update(users).set({ orgTop: true }).where(eq(users.id, created.id));
    await this.log(actor.id, 'PERSON_CREATED', created.id, null, {
      reportsToId: input.reportsToId ?? null,
      designation: input.designation ?? null,
    });
    return {
      id: created.id,
      name: created.name,
      email: created.email,
      tempPassword: created.tempPassword,
      reportsToId: input.reportsToId ?? null,
    };
  }

  /** Replace a team's members. Admin: any. A team's manager: their own team, adding only people from below them. */
  async setTeamMembersAs(actor: Actor, teamId: string, userIds: string[]) {
    const [team] = await this.db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) throw new NotFoundException('Team not found');
    const current = await this.teamMemberIds(teamId);
    if (actor.role !== 'ADMIN') {
      if (team.managerId !== actor.id)
        throw new ForbiddenException('You can only change a team you lead');
      const all = await this.db
        .select({ id: users.id, reportsToId: users.reportsToId })
        .from(users);
      const allowed = subtreeOf(actor.id, all);
      allowed.add(actor.id);
      const bad = userIds.filter((id) => !current.includes(id) && !allowed.has(id));
      if (bad.length) throw new ForbiddenException('You can only add people from your own team');
    }
    const result = await this.setTeamMembers(teamId, [...new Set(userIds)]);
    await this.log(
      actor.id,
      'TEAM_MEMBERS',
      teamId,
      { userIds: current },
      { userIds: result.userIds },
    );
    return result;
  }

  /**
   * Admin only: take someone off the chart (they are not deleted or deactivated). Their reports move up to the
   * manager they had, or to the top when they had none, so nobody is orphaned.
   */
  async removeFromChart(actor: Actor, personId: string) {
    if (actor.role !== 'ADMIN')
      throw new ForbiddenException('Only an admin can take someone off the chart');
    const all = await this.db
      .select({
        id: users.id,
        reportsToId: users.reportsToId,
        orgTop: users.orgTop,
        isActive: users.isActive,
      })
      .from(users);
    const person = all.find((u) => u.id === personId && u.isActive);
    if (!person) throw new NotFoundException('Person not found');
    const reports = all.filter((u) => u.reportsToId === personId && u.isActive);
    await this.db.transaction(async (tx) => {
      for (const r of reports) {
        await tx
          .update(users)
          .set({
            reportsToId: person.reportsToId,
            orgTop: person.reportsToId === null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, r.id));
      }
      await tx
        .update(users)
        .set({ reportsToId: null, orgTop: false, updatedAt: new Date() })
        .where(eq(users.id, personId));
    });
    await this.log(
      actor.id,
      'PERSON_REMOVED',
      personId,
      {
        reportsToId: person.reportsToId,
        wasTop: person.orgTop,
        movedReports: reports.map((r) => r.id),
      },
      { reportsToId: null },
    );
    return { id: personId, movedReports: reports.length };
  }

  async changes(actor: Actor, limit = 50): Promise<OrgChangeItem[]> {
    if (actor.role !== 'ADMIN')
      throw new ForbiddenException('Only an admin can read the change log');
    const rows = await this.db
      .select({
        id: orgChanges.id,
        actor: users.name,
        kind: orgChanges.kind,
        subjectId: orgChanges.subjectId,
        before: orgChanges.beforeValue,
        after: orgChanges.afterValue,
        createdAt: orgChanges.createdAt,
      })
      .from(orgChanges)
      .innerJoin(users, eq(users.id, orgChanges.actorId))
      .orderBy(desc(orgChanges.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
    return rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      kind: r.kind,
      subject: r.subjectId,
      before: r.before,
      after: r.after,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async updateTeam(id: string, input: UpdateTeamInput) {
    const all = await this.db.select().from(teams);
    const team = all.find((t) => t.id === id);
    if (!team) throw new NotFoundException('Team not found');
    const patch: Partial<typeof teams.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.managerId !== undefined) {
      if (input.managerId !== null) {
        const [u] = await this.db
          .select({ isActive: users.isActive })
          .from(users)
          .where(eq(users.id, input.managerId));
        if (!u || !u.isActive)
          throw new BadRequestException('The manager must be an active person');
      }
      patch.managerId = input.managerId;
    }
    if (input.parentTeamId !== undefined) {
      if (input.parentTeamId !== null) {
        const parent = all.find((t) => t.id === input.parentTeamId);
        if (!parent || parent.isArchived) throw new BadRequestException('Parent team not found');
        // Walk up from the proposed parent; reaching this team means the move would form a loop.
        for (
          let cur: typeof parent | undefined = parent, hops = 0;
          cur;
          cur = all.find((t) => t.id === cur!.parentTeamId), hops += 1
        ) {
          if (cur.id === id)
            throw new BadRequestException(
              'A team cannot sit under itself or one of its own sub-teams',
            );
          if (hops > all.length) break;
        }
      }
      patch.parentTeamId = input.parentTeamId;
    }
    if (Object.keys(patch).length === 0) return team;
    try {
      const [updated] = await this.db.update(teams).set(patch).where(eq(teams.id, id)).returning();
      
      // If the manager changed, automatically add their direct reports to this team
      if (patch.managerId) {
        const reports = await this.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.reportsToId, patch.managerId), eq(users.isActive, true)));
          
        if (reports.length > 0) {
          await this.db
            .insert(teamMembers)
            .values(reports.map((r) => ({ teamId: id, userId: r.id })))
            .onConflictDoNothing();
        }
      }
      
      return updated;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException(`A team named "${input.name}" already exists`);
      throw e;
    }
  }

  async setTeamMembers(id: string, userIds: string[]) {
    const [team] = await this.db.select({ id: teams.id }).from(teams).where(eq(teams.id, id));
    if (!team) throw new NotFoundException('Team not found');
    await this.db.transaction(async (tx) => {
      await tx.delete(teamMembers).where(eq(teamMembers.teamId, id));
      if (userIds.length)
        await tx.insert(teamMembers).values(userIds.map((userId) => ({ teamId: id, userId })));
    });
    return { teamId: id, userIds };
  }
  async teamMemberIds(id: string) {
    return (
      await this.db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, id))
    ).map((x) => x.userId);
  }
  async setWorkspaceTeams(id: string, teamIds: string[]) {
    const [ws] = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, id));
    if (!ws) throw new NotFoundException('Workspace not found');
    await this.db.transaction(async (tx) => {
      await tx.delete(workspaceTeams).where(eq(workspaceTeams.workspaceId, id));
      if (teamIds.length)
        await tx
          .insert(workspaceTeams)
          .values(teamIds.map((teamId) => ({ workspaceId: id, teamId })));
    });
    return { workspaceId: id, teamIds };
  }
  async workspaceTeamIds(id: string) {
    return (
      await this.db
        .select({ teamId: workspaceTeams.teamId })
        .from(workspaceTeams)
        .where(eq(workspaceTeams.workspaceId, id))
    ).map((x) => x.teamId);
  }
}
