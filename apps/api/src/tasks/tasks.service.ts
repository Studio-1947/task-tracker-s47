import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type {
  AuditEntry,
  CreateTaskInput,
  LabelRef,
  Paginated,
  TaskComment,
  TaskDetail,
  TaskListItem,
  TaskQuery,
  UpdateTaskInput,
  UserRef,
} from '@task-tracker/shared';
import { AuditAction } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  labels,
  taskAssignees,
  taskComments,
  taskLabels,
  tasks,
  users,
  workspaceMembers,
  workspaces,
  type TaskRow,
} from '../database/schema';
import { AuditService } from '../audit/audit.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type Actor = { id: string; role: string };

@Injectable()
export class TasksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workspaces: WorkspacesService,
    private readonly audit: AuditService,
  ) {}

  // ── helpers ───────────────────────────────────────────────────────────────

  private ref(prefix: string, number: number): string {
    return `${prefix}-${number}`;
  }

  private async loadTaskOrThrow(taskId: string): Promise<TaskRow & { taskPrefix: string }> {
    const [row] = await this.db
      .select({ task: tasks, taskPrefix: workspaces.taskPrefix })
      .from(tasks)
      .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!row) throw new NotFoundException('Task not found');
    return { ...row.task, taskPrefix: row.taskPrefix };
  }

  private async assertAssigneesAreMembers(workspaceId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const unique = [...new Set(userIds)];
    const rows = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, unique)));
    if (rows.length !== unique.length) {
      throw new ForbiddenException('All assignees must be members of the workspace');
    }
  }

  private async assertLabelsInWorkspace(workspaceId: string, labelIds: string[]): Promise<void> {
    if (labelIds.length === 0) return;
    const unique = [...new Set(labelIds)];
    const rows = await this.db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.workspaceId, workspaceId), inArray(labels.id, unique)));
    if (rows.length !== unique.length) {
      throw new NotFoundException('One or more labels do not belong to this workspace');
    }
  }

  /** Bulk-load assignees, labels and comment counts for a set of task ids. */
  private async loadRelations(taskIds: string[]): Promise<{
    assignees: Map<string, UserRef[]>;
    labels: Map<string, LabelRef[]>;
    commentCounts: Map<string, number>;
  }> {
    const assigneeMap = new Map<string, UserRef[]>();
    const labelMap = new Map<string, LabelRef[]>();
    const commentCounts = new Map<string, number>();
    if (taskIds.length === 0) return { assignees: assigneeMap, labels: labelMap, commentCounts };

    const [assigneeRows, labelRows, commentRows] = await Promise.all([
      this.db
        .select({ taskId: taskAssignees.taskId, id: users.id, name: users.name, email: users.email })
        .from(taskAssignees)
        .innerJoin(users, eq(users.id, taskAssignees.userId))
        .where(inArray(taskAssignees.taskId, taskIds)),
      this.db
        .select({ taskId: taskLabels.taskId, id: labels.id, name: labels.name, color: labels.color })
        .from(taskLabels)
        .innerJoin(labels, eq(labels.id, taskLabels.labelId))
        .where(inArray(taskLabels.taskId, taskIds)),
      this.db
        .select({ taskId: taskComments.taskId, c: count() })
        .from(taskComments)
        .where(inArray(taskComments.taskId, taskIds))
        .groupBy(taskComments.taskId),
    ]);

    for (const r of assigneeRows) {
      const list = assigneeMap.get(r.taskId) ?? [];
      list.push({ id: r.id, name: r.name, email: r.email });
      assigneeMap.set(r.taskId, list);
    }
    for (const r of labelRows) {
      const list = labelMap.get(r.taskId) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color });
      labelMap.set(r.taskId, list);
    }
    for (const r of commentRows) commentCounts.set(r.taskId, Number(r.c));

    return { assignees: assigneeMap, labels: labelMap, commentCounts };
  }

  private toListItem(
    t: TaskRow,
    prefix: string,
    rel: { assignees: Map<string, UserRef[]>; labels: Map<string, LabelRef[]>; commentCounts: Map<string, number> },
  ): TaskListItem {
    return {
      id: t.id,
      workspaceId: t.workspaceId,
      number: t.number,
      ref: this.ref(prefix, t.number),
      title: t.title,
      status: t.status as TaskListItem['status'],
      priority: t.priority as TaskListItem['priority'],
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      assignees: rel.assignees.get(t.id) ?? [],
      labels: rel.labels.get(t.id) ?? [],
      commentCount: rel.commentCounts.get(t.id) ?? 0,
      isArchived: t.isArchived,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private async userRef(userId: string): Promise<UserRef> {
    const [u] = await this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u ?? { id: userId, name: 'Unknown', email: '' };
  }

  // ── commands ──────────────────────────────────────────────────────────────

  async create(workspaceId: string, actor: Actor, input: CreateTaskInput): Promise<TaskDetail> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const assigneeIds = input.assigneeIds ?? [];
    const labelIds = input.labelIds ?? [];
    await this.assertAssigneesAreMembers(workspaceId, assigneeIds);
    await this.assertLabelsInWorkspace(workspaceId, labelIds);

    const created = await this.db.transaction(async (tx) => {
      // Atomically claim the next per-workspace number for the human-readable ref.
      const [seq] = await tx
        .update(workspaces)
        .set({ taskSeq: sql`${workspaces.taskSeq} + 1` })
        .where(eq(workspaces.id, workspaceId))
        .returning({ number: workspaces.taskSeq, prefix: workspaces.taskPrefix });
      if (!seq) throw new NotFoundException('Workspace not found');

      const [task] = await tx
        .insert(tasks)
        .values({
          workspaceId,
          number: seq.number,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? 'TODO',
          priority: input.priority ?? 'MEDIUM',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          createdById: actor.id,
        })
        .returning();
      if (!task) throw new Error('Failed to create task');

      if (assigneeIds.length) {
        await tx.insert(taskAssignees).values(assigneeIds.map((userId) => ({ taskId: task.id, userId })));
      }
      if (labelIds.length) {
        await tx.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId: task.id, labelId })));
      }

      await this.audit.record(
        {
          workspaceId,
          taskId: task.id,
          userId: actor.id,
          action: AuditAction.CREATED,
          afterValue: {
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate?.toISOString() ?? null,
            assigneeIds,
          },
        },
        tx,
      );

      return { task, prefix: seq.prefix };
    });

    return this.getOne(created.task.id, actor);
  }

  async list(workspaceId: string, actor: Actor, query: TaskQuery): Promise<Paginated<TaskListItem>> {
    await this.workspaces.assertCanAccess(workspaceId, actor);

    const [ws] = await this.db
      .select({ prefix: workspaces.taskPrefix })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!ws) throw new NotFoundException('Workspace not found');

    const conds = [eq(tasks.workspaceId, workspaceId)];
    if (!query.includeArchived) conds.push(eq(tasks.isArchived, false));
    if (query.status) conds.push(eq(tasks.status, query.status));
    if (query.priority) conds.push(eq(tasks.priority, query.priority));
    if (query.dueBefore) conds.push(lte(tasks.dueDate, new Date(query.dueBefore)));
    if (query.dueAfter) conds.push(gte(tasks.dueDate, new Date(query.dueAfter)));
    if (query.search) {
      const like = `%${query.search}%`;
      const searchCond = or(ilike(tasks.title, like), ilike(tasks.description, like));
      if (searchCond) conds.push(searchCond);
    }
    // Filter by assignee via an EXISTS-style inArray on the join table.
    if (query.assigneeId) {
      const assigned = this.db
        .select({ id: taskAssignees.taskId })
        .from(taskAssignees)
        .where(eq(taskAssignees.userId, query.assigneeId));
      conds.push(inArray(tasks.id, assigned));
    }
    if (query.labelId) {
      const labelled = this.db
        .select({ id: taskLabels.taskId })
        .from(taskLabels)
        .where(eq(taskLabels.labelId, query.labelId));
      conds.push(inArray(tasks.id, labelled));
    }
    const where = and(...conds);

    const sortCol = {
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
      status: tasks.status,
      number: tasks.number,
    }[query.sort];
    const orderBy = query.order === 'asc' ? asc(sortCol) : desc(sortCol);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(tasks)
      .where(where);

    const rows = await this.db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const rel = await this.loadRelations(rows.map((r) => r.id));
    return {
      items: rows.map((t) => this.toListItem(t, ws.prefix, rel)),
      total: Number(total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getOne(taskId: string, actor: Actor): Promise<TaskDetail> {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const rel = await this.loadRelations([taskId]);
    const base = this.toListItem(task, task.taskPrefix, rel);
    const createdBy = await this.userRef(task.createdById);
    return { ...base, description: task.description, createdBy };
  }

  async update(taskId: string, actor: Actor, input: UpdateTaskInput): Promise<TaskDetail> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);

    const currentAssignees = (
      await this.db
        .select({ userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, taskId))
    )
      .map((r) => r.userId)
      .sort();

    if (input.assigneeIds) await this.assertAssigneesAreMembers(current.workspaceId, input.assigneeIds);
    if (input.labelIds) await this.assertLabelsInWorkspace(current.workspaceId, input.labelIds);

    const currentLabels = (
      await this.db
        .select({ labelId: taskLabels.labelId })
        .from(taskLabels)
        .where(eq(taskLabels.taskId, taskId))
    )
      .map((r) => r.labelId)
      .sort();

    await this.db.transaction(async (tx) => {
      const patch: Partial<TaskRow> = {};
      const audits: { action: AuditAction; before: unknown; after: unknown }[] = [];

      if (input.title !== undefined && input.title !== current.title) {
        patch.title = input.title;
        audits.push({ action: AuditAction.TITLE_CHANGED, before: current.title, after: input.title });
      }
      if (input.description !== undefined && (input.description ?? null) !== current.description) {
        patch.description = input.description ?? null;
        audits.push({
          action: AuditAction.DESCRIPTION_CHANGED,
          before: current.description,
          after: input.description ?? null,
        });
      }
      if (input.status !== undefined && input.status !== current.status) {
        patch.status = input.status;
        audits.push({ action: AuditAction.STATUS_CHANGED, before: current.status, after: input.status });
      }
      if (input.priority !== undefined && input.priority !== current.priority) {
        patch.priority = input.priority;
        audits.push({ action: AuditAction.PRIORITY_CHANGED, before: current.priority, after: input.priority });
      }
      if (input.dueDate !== undefined) {
        const nextDue = input.dueDate ? new Date(input.dueDate) : null;
        const currentIso = current.dueDate ? current.dueDate.toISOString() : null;
        const nextIso = nextDue ? nextDue.toISOString() : null;
        if (currentIso !== nextIso) {
          patch.dueDate = nextDue;
          audits.push({ action: AuditAction.DUE_DATE_CHANGED, before: currentIso, after: nextIso });
        }
      }

      let assigneesChanged = false;
      if (input.assigneeIds) {
        const next = [...new Set(input.assigneeIds)].sort();
        if (JSON.stringify(next) !== JSON.stringify(currentAssignees)) {
          assigneesChanged = true;
          await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
          if (next.length) {
            await tx.insert(taskAssignees).values(next.map((userId) => ({ taskId, userId })));
          }
          audits.push({
            action: AuditAction.ASSIGNEE_CHANGED,
            before: currentAssignees,
            after: next,
          });
        }
      }

      // Labels are lightweight metadata — replaced wholesale, not audited (no
      // LABEL_CHANGED action; avoids a pgEnum migration).
      let labelsChanged = false;
      if (input.labelIds) {
        const next = [...new Set(input.labelIds)].sort();
        if (JSON.stringify(next) !== JSON.stringify(currentLabels)) {
          labelsChanged = true;
          await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
          if (next.length) {
            await tx.insert(taskLabels).values(next.map((labelId) => ({ taskId, labelId })));
          }
        }
      }

      if (Object.keys(patch).length > 0 || assigneesChanged || labelsChanged) {
        await tx
          .update(tasks)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(tasks.id, taskId));
      }

      // One audit row per changed tracked field (PRD §3.5 / §7).
      for (const a of audits) {
        await this.audit.record(
          {
            workspaceId: current.workspaceId,
            taskId,
            userId: actor.id,
            action: a.action,
            beforeValue: a.before,
            afterValue: a.after,
          },
          tx,
        );
      }
    });

    return this.getOne(taskId, actor);
  }

  async archive(taskId: string, actor: Actor): Promise<{ id: string; isArchived: boolean }> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);
    if (current.isArchived) return { id: taskId, isArchived: true };

    await this.db.transaction(async (tx) => {
      await tx.update(tasks).set({ isArchived: true, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      await this.audit.record(
        { workspaceId: current.workspaceId, taskId, userId: actor.id, action: AuditAction.ARCHIVED },
        tx,
      );
    });
    return { id: taskId, isArchived: true };
  }

  // ── comments ──────────────────────────────────────────────────────────────

  async addComment(taskId: string, actor: Actor, body: string): Promise<TaskComment> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);

    const comment = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(taskComments)
        .values({ taskId, userId: actor.id, body })
        .returning();
      if (!row) throw new Error('Failed to add comment');
      await this.audit.record(
        {
          workspaceId: current.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.COMMENTED,
          afterValue: { commentId: row.id, body },
        },
        tx,
      );
      return row;
    });

    const user = await this.userRef(actor.id);
    return { id: comment.id, body: comment.body, user, createdAt: comment.createdAt.toISOString() };
  }

  async listComments(taskId: string, actor: Actor): Promise<TaskComment[]> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);
    const rows = await this.db
      .select({
        id: taskComments.id,
        body: taskComments.body,
        createdAt: taskComments.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(taskComments)
      .innerJoin(users, eq(users.id, taskComments.userId))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      user: { id: r.userId, name: r.userName, email: r.userEmail },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async history(taskId: string, actor: Actor): Promise<AuditEntry[]> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);
    return this.audit.taskHistory(taskId);
  }
}
