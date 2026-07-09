import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import type { CreateProjectInput, ProjectSummary, UpdateProjectInput } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { projects, tasks, type ProjectRow } from '../database/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type Actor = { id: string; role: string };

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workspaces: WorkspacesService,
  ) {}

  private toSummary(p: ProjectRow, taskCount?: number): ProjectSummary {
    return {
      id: p.id,
      workspaceId: p.workspaceId,
      name: p.name,
      description: p.description,
      color: p.color,
      taskPrefix: p.taskPrefix,
      isArchived: p.isArchived,
      createdAt: p.createdAt.toISOString(),
      ...(taskCount !== undefined ? { taskCount } : {}),
    };
  }

  /** Derive a task prefix from a name when not supplied, e.g. "Website" -> "WEB". */
  static derivePrefix(name: string): string {
    const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    return (letters.slice(0, 3) || 'PR').padEnd(2, 'X');
  }

  private async loadOrThrow(projectId: string): Promise<ProjectRow> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!row) throw new NotFoundException('Project not found');
    return row;
  }

  /** Throws unless the actor can access the project's workspace; returns the project. */
  async assertCanAccess(projectId: string, actor: Actor): Promise<ProjectRow> {
    const project = await this.loadOrThrow(projectId);
    await this.workspaces.assertCanAccess(project.workspaceId, actor);
    return project;
  }

  async list(workspaceId: string, actor: Actor): Promise<ProjectSummary[]> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const [rows, taskCounts] = await Promise.all([
      this.db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, workspaceId))
        .orderBy(asc(projects.name)),
      this.db
        .select({ projectId: tasks.projectId, c: count() })
        .from(tasks)
        .where(eq(tasks.isArchived, false))
        .groupBy(tasks.projectId),
    ]);
    const countBy = new Map(taskCounts.map((r) => [r.projectId, Number(r.c)]));
    return rows.map((p) => this.toSummary(p, countBy.get(p.id) ?? 0));
  }

  async getOne(projectId: string, actor: Actor): Promise<ProjectSummary> {
    const project = await this.assertCanAccess(projectId, actor);
    const [{ c } = { c: 0 }] = await this.db
      .select({ c: count() })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.isArchived, false)));
    return this.toSummary(project, Number(c));
  }

  async create(workspaceId: string, actor: Actor, input: CreateProjectInput): Promise<ProjectSummary> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const [p] = await this.db
      .insert(projects)
      .values({
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        taskPrefix: input.taskPrefix ?? ProjectsService.derivePrefix(input.name),
        createdById: actor.id,
      })
      .returning();
    return this.toSummary(p!, 0);
  }

  async update(projectId: string, actor: Actor, input: UpdateProjectInput): Promise<ProjectSummary> {
    await this.assertCanAccess(projectId, actor);
    const [p] = await this.db
      .update(projects)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();
    return this.toSummary(p!);
  }
}
