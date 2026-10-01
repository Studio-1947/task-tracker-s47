import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';
import { clients, offices, teamMembers, teams, workspaceTeams, workspaces } from '../database/schema';
const KINDS = ['offices', 'clients', 'teams'] as const;

/** Postgres reports a duplicate as SQLSTATE 23505, either on the error or wrapped in `cause`. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
}

@Injectable()
export class OrganisationService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  private assertKind(kind: string): asserts kind is (typeof KINDS)[number] {
    if (!(KINDS as readonly string[]).includes(kind)) throw new BadRequestException(`Unknown directory "${kind}"; use offices, clients or teams`);
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
      if (kind === 'offices') return (await this.db.insert(offices).values({ name, timezone: input.timezone ?? 'Asia/Kolkata' }).returning())[0];
      if (kind === 'clients') return (await this.db.insert(clients).values({ name }).returning())[0];
      return (await this.db.insert(teams).values({ name }).returning())[0];
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`A ${kind.slice(0, -1)} named "${name}" already exists`);
      throw e;
    }
  }

  async setTeamMembers(id: string, userIds: string[]) { const [team] = await this.db.select({id:teams.id}).from(teams).where(eq(teams.id,id)); if (!team) throw new NotFoundException('Team not found'); await this.db.transaction(async tx => { await tx.delete(teamMembers).where(eq(teamMembers.teamId,id)); if (userIds.length) await tx.insert(teamMembers).values(userIds.map(userId=>({teamId:id,userId}))); }); return { teamId:id, userIds }; }
  async teamMemberIds(id: string) { return (await this.db.select({userId:teamMembers.userId}).from(teamMembers).where(eq(teamMembers.teamId,id))).map(x=>x.userId); }
  async setWorkspaceTeams(id: string, teamIds: string[]) { const [ws]=await this.db.select({id:workspaces.id}).from(workspaces).where(eq(workspaces.id,id)); if(!ws) throw new NotFoundException('Workspace not found'); await this.db.transaction(async tx=>{await tx.delete(workspaceTeams).where(eq(workspaceTeams.workspaceId,id));if(teamIds.length) await tx.insert(workspaceTeams).values(teamIds.map(teamId=>({workspaceId:id,teamId})));});return {workspaceId:id,teamIds}; }
  async workspaceTeamIds(id: string) { return (await this.db.select({teamId:workspaceTeams.teamId}).from(workspaceTeams).where(eq(workspaceTeams.workspaceId,id))).map(x=>x.teamId); }
}
