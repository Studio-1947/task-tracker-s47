import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';
import { clients, offices, teamMembers, teams } from '../database/schema';
@Injectable()
export class OrganisationService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  list(kind: 'offices'|'clients'|'teams') { const table = kind === 'offices' ? offices : kind === 'clients' ? clients : teams; return this.db.select().from(table).orderBy(asc(table.name)); }
  async create(kind: 'offices'|'clients'|'teams', input: {name:string; timezone?:string}) { if (kind === 'offices') return (await this.db.insert(offices).values({ name: input.name, timezone: input.timezone ?? 'Asia/Kolkata' }).returning())[0]; if (kind === 'clients') return (await this.db.insert(clients).values({ name: input.name }).returning())[0]; return (await this.db.insert(teams).values({ name: input.name }).returning())[0]; }
  async setTeamMembers(id: string, userIds: string[]) { const [team] = await this.db.select({id:teams.id}).from(teams).where(eq(teams.id,id)); if (!team) throw new NotFoundException('Team not found'); await this.db.transaction(async tx => { await tx.delete(teamMembers).where(eq(teamMembers.teamId,id)); if (userIds.length) await tx.insert(teamMembers).values(userIds.map(userId=>({teamId:id,userId}))); }); return { teamId:id, userIds }; }
}
