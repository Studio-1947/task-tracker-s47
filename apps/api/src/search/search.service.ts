import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { Role, type SearchResults, type TaskStatus } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { projects, tasks, users, workspaces } from '../database/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type Actor = { id: string; role: string };

const GROUP_LIMIT = 5;

@Injectable()
export class SearchService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workspaces: WorkspacesService,
  ) {}

  async search(q: string, actor: Actor): Promise<SearchResults> {
    const isAdmin = actor.role === Role.ADMIN;
    // Members only see workspaces they belong to; admins see everything.
    const scopeIds = isAdmin ? null : await this.workspaces.membershipIds(actor.id);

    const [taskResults, workspaceResults, projectResults, userResults] = await Promise.all([
      this.searchTasks(q, scopeIds),
      this.searchWorkspaces(q, scopeIds),
      this.searchProjects(q, scopeIds),
      isAdmin ? this.searchUsers(q) : Promise.resolve(null),
    ]);

    return {
      tasks: taskResults,
      workspaces: workspaceResults,
      projects: projectResults,
      users: userResults,
    };
  }

  private async searchTasks(q: string, scopeIds: string[] | null): Promise<SearchResults['tasks']> {
    if (scopeIds && scopeIds.length === 0) return [];
    const like = `%${q}%`;

    const matchers: (SQL | undefined)[] = [ilike(tasks.title, like), ilike(tasks.description, like)];
    // "WEB-12" / "web12" style queries match the human-readable (project) ref directly.
    const refMatch = /^([a-zA-Z]+)-?(\d+)$/.exec(q.trim());
    if (refMatch) {
      matchers.push(and(ilike(projects.taskPrefix, refMatch[1]!), eq(tasks.number, Number(refMatch[2]))));
    }

    const conds = [eq(tasks.isArchived, false), or(...matchers)];
    if (scopeIds) conds.push(inArray(tasks.workspaceId, scopeIds));

    const rows = await this.db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        status: tasks.status,
        workspaceId: tasks.workspaceId,
        workspaceName: workspaces.name,
        prefix: projects.taskPrefix,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
      .where(and(...conds))
      .orderBy(desc(tasks.updatedAt))
      .limit(GROUP_LIMIT);

    return rows.map((r) => ({
      id: r.id,
      ref: `${r.prefix}-${r.number}`,
      title: r.title,
      status: r.status as TaskStatus,
      workspaceId: r.workspaceId,
      workspaceName: r.workspaceName,
    }));
  }

  private async searchWorkspaces(q: string, scopeIds: string[] | null): Promise<SearchResults['workspaces']> {
    if (scopeIds && scopeIds.length === 0) return [];
    const conds = [eq(workspaces.isArchived, false), ilike(workspaces.name, `%${q}%`)];
    if (scopeIds) conds.push(inArray(workspaces.id, scopeIds));
    return this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        color: workspaces.color,
      })
      .from(workspaces)
      .where(and(...conds))
      .limit(GROUP_LIMIT);
  }

  private async searchProjects(q: string, scopeIds: string[] | null): Promise<SearchResults['projects']> {
    if (scopeIds && scopeIds.length === 0) return [];
    const conds = [eq(projects.isArchived, false), ilike(projects.name, `%${q}%`)];
    if (scopeIds) conds.push(inArray(projects.workspaceId, scopeIds));
    return this.db
      .select({
        id: projects.id,
        name: projects.name,
        color: projects.color,
        taskPrefix: projects.taskPrefix,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
      })
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(...conds))
      .limit(GROUP_LIMIT);
  }

  private async searchUsers(q: string): Promise<NonNullable<SearchResults['users']>> {
    const like = `%${q}%`;
    const rows = await this.db
      .select()
      .from(users)
      .where(or(ilike(users.name, like), ilike(users.email, like)))
      .orderBy(desc(users.isActive), users.name)
      .limit(GROUP_LIMIT);
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as NonNullable<SearchResults['users']>[number]['role'],
      avatarKey: u.avatarKey,
      designation: u.designation,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));
  }
}
