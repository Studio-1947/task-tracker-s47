import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type {
  AuditEntry,
  CreateTaskInput,
  LabelRef,
  Paginated,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskListItem,
  TaskQuery,
  UpdateTaskInput,
  UserRef,
} from '@task-tracker/shared';
import { AuditAction, Role } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  labels,
  projects,
  taskAssignees,
  taskAttachments,
  taskComments,
  taskLabels,
  tasks,
  users,
  workspaceMembers,
  type TaskRow,
} from '../database/schema';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type Actor = { id: string; role: string };

@Injectable()
export class TasksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workspaces: WorkspacesService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  // ── helpers ───────────────────────────────────────────────────────────────

  private ref(prefix: string, number: number): string {
    return `${prefix}-${number}`;
  }

  private async loadTaskOrThrow(
    taskId: string,
  ): Promise<TaskRow & { taskPrefix: string; projectName: string }> {
    const [row] = await this.db
      .select({ task: tasks, taskPrefix: projects.taskPrefix, projectName: projects.name })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!row) throw new NotFoundException('Task not found');
    return { ...row.task, taskPrefix: row.taskPrefix, projectName: row.projectName };
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

  /** Bulk-load assignees, labels, comment + attachment counts for a set of task ids. */
  private async loadRelations(taskIds: string[]): Promise<{
    assignees: Map<string, UserRef[]>;
    labels: Map<string, LabelRef[]>;
    commentCounts: Map<string, number>;
    attachmentCounts: Map<string, number>;
  }> {
    const assigneeMap = new Map<string, UserRef[]>();
    const labelMap = new Map<string, LabelRef[]>();
    const commentCounts = new Map<string, number>();
    const attachmentCounts = new Map<string, number>();
    if (taskIds.length === 0)
      return { assignees: assigneeMap, labels: labelMap, commentCounts, attachmentCounts };

    const [assigneeRows, labelRows, commentRows, attachmentRows] = await Promise.all([
      this.db
        .select({
          taskId: taskAssignees.taskId,
          id: users.id,
          name: users.name,
          email: users.email,
          avatarKey: users.avatarKey,
        })
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
      this.db
        .select({ taskId: taskAttachments.taskId, c: count() })
        .from(taskAttachments)
        .where(inArray(taskAttachments.taskId, taskIds))
        .groupBy(taskAttachments.taskId),
    ]);

    for (const r of assigneeRows) {
      const list = assigneeMap.get(r.taskId) ?? [];
      list.push({ id: r.id, name: r.name, email: r.email, avatarKey: r.avatarKey });
      assigneeMap.set(r.taskId, list);
    }
    for (const r of labelRows) {
      const list = labelMap.get(r.taskId) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color });
      labelMap.set(r.taskId, list);
    }
    for (const r of commentRows) commentCounts.set(r.taskId, Number(r.c));
    for (const r of attachmentRows) attachmentCounts.set(r.taskId, Number(r.c));

    return { assignees: assigneeMap, labels: labelMap, commentCounts, attachmentCounts };
  }

  private toListItem(
    t: TaskRow,
    prefix: string,
    projectName: string,
    rel: {
      assignees: Map<string, UserRef[]>;
      labels: Map<string, LabelRef[]>;
      commentCounts: Map<string, number>;
      attachmentCounts: Map<string, number>;
    },
  ): TaskListItem {
    return {
      id: t.id,
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      projectName,
      number: t.number,
      ref: this.ref(prefix, t.number),
      title: t.title,
      status: t.status as TaskListItem['status'],
      priority: t.priority as TaskListItem['priority'],
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      assignees: rel.assignees.get(t.id) ?? [],
      labels: rel.labels.get(t.id) ?? [],
      commentCount: rel.commentCounts.get(t.id) ?? 0,
      attachmentCount: rel.attachmentCounts.get(t.id) ?? 0,
      isArchived: t.isArchived,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private async userRef(userId: string): Promise<UserRef> {
    const [u] = await this.db
      .select({ id: users.id, name: users.name, email: users.email, avatarKey: users.avatarKey })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u ?? { id: userId, name: 'Unknown', email: '', avatarKey: null };
  }

  // ── commands ──────────────────────────────────────────────────────────────

  async create(workspaceId: string, actor: Actor, input: CreateTaskInput): Promise<TaskDetail> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const assigneeIds = input.assigneeIds ?? [];
    const labelIds = input.labelIds ?? [];
    await this.assertAssigneesAreMembers(workspaceId, assigneeIds);
    await this.assertLabelsInWorkspace(workspaceId, labelIds);

    const created = await this.db.transaction(async (tx) => {
      // Atomically claim the next per-project number for the human-readable ref.
      // The workspace guard scopes the WHERE so a project from another workspace
      // (or a bad id) claims nothing and 404s.
      const [seq] = await tx
        .update(projects)
        .set({ taskSeq: sql`${projects.taskSeq} + 1` })
        .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, workspaceId)))
        .returning({ number: projects.taskSeq, prefix: projects.taskPrefix });
      if (!seq) throw new NotFoundException('Project not found in this workspace');

      const [task] = await tx
        .insert(tasks)
        .values({
          workspaceId,
          projectId: input.projectId,
          number: seq.number,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? 'TODO',
          priority: input.priority ?? 'MEDIUM',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          completedAt: input.status === 'DONE' ? new Date() : null,
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

    const conds = [eq(tasks.workspaceId, workspaceId)];
    if (query.projectId) conds.push(eq(tasks.projectId, query.projectId));
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
      .select({ task: tasks, prefix: projects.taskPrefix, projectName: projects.name })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const rel = await this.loadRelations(rows.map((r) => r.task.id));
    return {
      items: rows.map((r) => this.toListItem(r.task, r.prefix, r.projectName, rel)),
      total: Number(total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getOne(taskId: string, actor: Actor): Promise<TaskDetail> {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const rel = await this.loadRelations([taskId]);
    const base = this.toListItem(task, task.taskPrefix, task.projectName, rel);
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
        // Track completion time for analytics; a re-opened task no longer counts as completed.
        patch.completedAt = input.status === 'DONE' ? new Date() : null;
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
        userAvatarKey: users.avatarKey,
      })
      .from(taskComments)
      .innerJoin(users, eq(users.id, taskComments.userId))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      user: { id: r.userId, name: r.userName, email: r.userEmail, avatarKey: r.userAvatarKey },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async history(taskId: string, actor: Actor): Promise<AuditEntry[]> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);
    return this.audit.taskHistory(taskId);
  }

  // ── attachments ───────────────────────────────────────────────────────────

  async listAttachments(taskId: string, actor: Actor): Promise<TaskAttachment[]> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);
    const rows = await this.db
      .select({
        id: taskAttachments.id,
        fileName: taskAttachments.fileName,
        mimeType: taskAttachments.mimeType,
        sizeBytes: taskAttachments.sizeBytes,
        storageKey: taskAttachments.storageKey,
        createdAt: taskAttachments.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatarKey: users.avatarKey,
      })
      .from(taskAttachments)
      .innerJoin(users, eq(users.id, taskAttachments.uploaderId))
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(asc(taskAttachments.createdAt));
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      storageKey: r.storageKey,
      uploader: { id: r.userId, name: r.userName, email: r.userEmail, avatarKey: r.userAvatarKey },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async addAttachment(taskId: string, actor: Actor, file: Express.Multer.File): Promise<TaskAttachment> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);

    const saved = await this.files.save('attachments', file);
    // Keep the original name for display but never trust it for storage.
    const fileName = file.originalname.slice(0, 255);
    try {
      const row = await this.db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(taskAttachments)
          .values({
            taskId,
            uploaderId: actor.id,
            fileName,
            storageKey: saved.key,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
          })
          .returning();
        if (!inserted) throw new Error('Failed to save attachment');
        await this.audit.record(
          {
            workspaceId: current.workspaceId,
            taskId,
            userId: actor.id,
            action: AuditAction.ATTACHMENT_ADDED,
            afterValue: { attachmentId: inserted.id, fileName },
          },
          tx,
        );
        return inserted;
      });
      const uploader = await this.userRef(actor.id);
      return {
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        storageKey: row.storageKey,
        uploader,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (err) {
      // The DB row is the source of truth — don't leave an orphaned file behind.
      await this.files.remove(saved.key).catch(() => undefined);
      throw err;
    }
  }

  async removeAttachment(taskId: string, attachmentId: string, actor: Actor): Promise<{ id: string }> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);

    const [attachment] = await this.db
      .select()
      .from(taskAttachments)
      .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.taskId, taskId)))
      .limit(1);
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.uploaderId !== actor.id && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the uploader or an admin can delete an attachment');
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
      await this.audit.record(
        {
          workspaceId: current.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.ATTACHMENT_REMOVED,
          beforeValue: { attachmentId, fileName: attachment.fileName },
        },
        tx,
      );
    });
    // After commit; missing files are tolerated.
    await this.files.remove(attachment.storageKey).catch(() => undefined);
    return { id: attachmentId };
  }

  /** Authorized lookup used by the file-serving route. */
  async attachmentByStorageKey(storageKey: string, actor: Actor) {
    const [row] = await this.db
      .select({ attachment: taskAttachments, workspaceId: tasks.workspaceId })
      .from(taskAttachments)
      .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
      .where(eq(taskAttachments.storageKey, storageKey))
      .limit(1);
    if (!row) throw new NotFoundException('File not found');
    await this.workspaces.assertCanAccess(row.workspaceId, actor);
    return row.attachment;
  }
}
