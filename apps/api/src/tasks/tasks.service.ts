import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type {
  AuditEntry,
  CreateLinkAttachmentInput,
  CreateSubtaskInput,
  CreateTaskInput,
  LabelRef,
  Paginated,
  Priority,
  SubtaskRef,
  SubmitTaskInput,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskListItem,
  TaskQuery,
  TaskStatus,
  TaskSubmission,
  ReviewTaskInput,
  UpdateTaskInput,
  ReviseEstimateInput,
  ReopenTaskInput,
  AllocateTimeEntryInput,
  DelegateReviewInput,
  ReviewQueueItem,
  UserRef,
} from '@task-tracker/shared';
import type { CapacityAllocationInput, ReservedTimeInput, UnallocatedWorkItem } from '@task-tracker/shared';
import { AttachmentKind, AuditAction, Role, apportionMinutes, calculateCapacity, intervalsOverlap, localMidnight, localWorkDate, mergeIntervals, splitAcrossLocalDays, workingMinutesElapsed } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  labels,
  projects,
  taskAssignees,
  taskAttachments,
  taskComments,
  taskLabels,
  taskSubmissions,
  taskTimeEntries,
  taskBlockers,
  taskDependencies,
  taskEstimateRevisions,
  taskReopenings,
  reviewerDelegations,
  capacityAllocations,
  reservedTimeBlocks,
  leaveRequests,
  organisationPolicies,
  tasks,
  users,
  workspaceMembers,
  workspaces,
  type TaskAttachmentRow,
  type TaskRow,
} from '../database/schema';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { FilesService } from '../files/files.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Calendar snapshot loaded once per request and reused across every task row it touches. */
type CalendarSnapshot = Awaited<ReturnType<CalendarService['get']>>;

type Actor = { id: string; role: string };

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);


  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workspaces: WorkspacesService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly calendar: CalendarService,
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

  /** Bulk-load assignees, labels, comment + attachment + subtask counts for a set of task ids. */
  private async loadRelations(taskIds: string[]): Promise<{
    assignees: Map<string, UserRef[]>;
    labels: Map<string, LabelRef[]>;
    commentCounts: Map<string, number>;
    attachmentCounts: Map<string, number>;
    subtaskCounts: Map<string, number>;
    subtaskDoneCounts: Map<string, number>;
    actualMinutes: Map<string, number>;
  }> {
    const assigneeMap = new Map<string, UserRef[]>();
    const labelMap = new Map<string, LabelRef[]>();
    const commentCounts = new Map<string, number>();
    const attachmentCounts = new Map<string, number>();
    const subtaskCounts = new Map<string, number>();
    const subtaskDoneCounts = new Map<string, number>();
    if (taskIds.length === 0)
      return {
        assignees: assigneeMap,
        labels: labelMap,
        commentCounts,
        attachmentCounts,
        subtaskCounts,
        subtaskDoneCounts,
        actualMinutes: new Map(),
      };

    const [assigneeRows, labelRows, commentRows, attachmentRows, subtaskRows] = await Promise.all([
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
      this.db
        .select({ parentTaskId: tasks.parentTaskId, status: tasks.status, c: count() })
        .from(tasks)
        .where(inArray(tasks.parentTaskId, taskIds))
        .groupBy(tasks.parentTaskId, tasks.status),
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
    for (const r of subtaskRows) {
      if (!r.parentTaskId) continue;
      subtaskCounts.set(r.parentTaskId, (subtaskCounts.get(r.parentTaskId) ?? 0) + Number(r.c));
      if (r.status === 'DONE') subtaskDoneCounts.set(r.parentTaskId, Number(r.c));
    }

    // Recorded effort per task, with a parent's total including its direct subtasks so it matches the rolled-up remaining estimate.
    const effortRows = await this.db
      .select({ root: sql<string>`coalesce(${tasks.parentTaskId}, ${tasks.id})`, minutes: sql<number>`coalesce(sum(${taskTimeEntries.durationMinutes}), 0)` })
      .from(taskTimeEntries)
      .innerJoin(tasks, eq(tasks.id, taskTimeEntries.taskId))
      .where(or(inArray(tasks.id, taskIds), inArray(tasks.parentTaskId, taskIds)))
      .groupBy(sql`coalesce(${tasks.parentTaskId}, ${tasks.id})`);
    const actualMinutes = new Map(effortRows.filter((r) => taskIds.includes(r.root)).map((r) => [r.root, Number(r.minutes)]));

    return { assignees: assigneeMap, labels: labelMap, commentCounts, attachmentCounts, subtaskCounts, subtaskDoneCounts, actualMinutes };
  }

  /**
   * Working-time ageing since `dueDate` (PRD §2 "Preserve commitments while
   * measuring working time") — `null` unless the task is actually overdue:
   * has a due date, it has passed, and the task hasn't reached DONE. Mirrors
   * the dashboard's overdue scope (`isNotNull(dueDate) && dueDate < now &&
   * status != DONE`) so the two never disagree.
   */
  private overdueWorkingMinutesFor(
    dueDate: Date | null,
    status: string,
    calendar: CalendarSnapshot | undefined,
    now: Date,
  ): number | null {
    if (!dueDate || status === 'DONE' || dueDate.getTime() >= now.getTime()) return null;
    const settings = calendar?.settings;
    if (!settings) return null;
    return workingMinutesElapsed(dueDate.toISOString(), now.toISOString(), settings, calendar!.exceptions);
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
      subtaskCounts: Map<string, number>;
      subtaskDoneCounts: Map<string, number>;
      actualMinutes: Map<string, number>;
    },
    people: Map<string, UserRef> = new Map(),
    calendar?: CalendarSnapshot,
    now: Date = new Date(),
  ): TaskListItem {
    return {
      id: t.id,
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      projectName,
      number: t.number,
      ref: this.ref(prefix, t.number),
      title: t.title,
      acceptanceCriteria: t.acceptanceCriteria,
      childScope: t.childScope as TaskListItem['childScope'],
      status: t.status as TaskListItem['status'],
      priority: t.priority as TaskListItem['priority'],
      size: t.size as TaskListItem['size'],
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      originalDueDate: t.originalDueDate ? t.originalDueDate.toISOString() : null,
      overdueWorkingMinutes: this.overdueWorkingMinutesFor(t.dueDate, t.status, calendar, now),
      owner: t.ownerId ? (people.get(t.ownerId) ?? null) : null,
      reviewer: t.reviewerId ? (people.get(t.reviewerId) ?? null) : null,
      baselineEstimateMinutes: t.baselineEstimateMinutes,
      currentEstimateMinutes: t.currentEstimateMinutes,
      remainingEstimateMinutes: t.remainingEstimateMinutes,
      actualEffortMinutes: rel.actualMinutes.get(t.id) ?? 0,
      assignees: rel.assignees.get(t.id) ?? [],
      labels: rel.labels.get(t.id) ?? [],
      commentCount: rel.commentCounts.get(t.id) ?? 0,
      attachmentCount: rel.attachmentCounts.get(t.id) ?? 0,
      parentTaskId: t.parentTaskId,
      subtaskCount: rel.subtaskCounts.get(t.id) ?? 0,
      subtaskDoneCount: rel.subtaskDoneCounts.get(t.id) ?? 0,
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

  private async userRefs(userIds: (string | null)[]): Promise<Map<string, UserRef>> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: users.id, name: users.name, email: users.email, avatarKey: users.avatarKey })
      .from(users)
      .where(inArray(users.id, ids));
    return new Map(rows.map((u) => [u.id, u]));
  }

  /** Validates a would-be parent: same workspace/project, and not itself a subtask (single-level nesting only). */
  private async assertParentEligible(
    workspaceId: string,
    projectId: string,
    parentTaskId: string,
  ): Promise<void> {
    const parent = await this.loadTaskOrThrow(parentTaskId);
    if (parent.workspaceId !== workspaceId || parent.projectId !== projectId) {
      throw new NotFoundException('Parent task not found in this project');
    }
    if (parent.parentTaskId) {
      throw new BadRequestException('A subtask cannot itself have subtasks');
    }
  }

  /** Assignees for a set of tasks — lighter than `loadRelations` when that's all you need. */
  private async assigneesFor(taskIds: string[]): Promise<Map<string, UserRef[]>> {
    const map = new Map<string, UserRef[]>();
    if (taskIds.length === 0) return map;
    const rows = await this.db
      .select({
        taskId: taskAssignees.taskId,
        id: users.id,
        name: users.name,
        email: users.email,
        avatarKey: users.avatarKey,
      })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(inArray(taskAssignees.taskId, taskIds));
    for (const r of rows) {
      const list = map.get(r.taskId) ?? [];
      list.push({ id: r.id, name: r.name, email: r.email, avatarKey: r.avatarKey });
      map.set(r.taskId, list);
    }
    return map;
  }

  private async subtaskRefsFor(taskIds: string[]): Promise<Map<string, SubtaskRef>> {
    const map = new Map<string, SubtaskRef>();
    if (taskIds.length === 0) return map;
    const [rows, assignees] = await Promise.all([
      this.db
        .select({ task: tasks, prefix: projects.taskPrefix })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(inArray(tasks.id, taskIds)),
      this.assigneesFor(taskIds),
    ]);
    for (const r of rows) {
      map.set(r.task.id, {
        id: r.task.id,
        ref: this.ref(r.prefix, r.task.number),
        title: r.task.title,
        status: r.task.status as TaskStatus,
        priority: r.task.priority as Priority,
        size: r.task.size as import('@task-tracker/shared').TaskSize,
        assignees: assignees.get(r.task.id) ?? [],
        dueDate: r.task.dueDate ? r.task.dueDate.toISOString() : null,
      });
    }
    return map;
  }

  /**
   * Once a parent has effort-bearing children, its baseline/current/remaining
   * estimate is the sum of its (non-archived) children's — counted exactly once,
   * never combined with any value entered directly on the parent (PRD §3 "Parent
   * rollup", AT06). No-op when the parent has no children yet, so a task keeps
   * direct estimates until it is actually broken up.
   */
  private async recalcParentRollup(
    parentTaskId: string,
    actorId: string,
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  ): Promise<void> {
    const children = await tx
      .select({
        baseline: tasks.baselineEstimateMinutes,
        current: tasks.currentEstimateMinutes,
        remaining: tasks.remainingEstimateMinutes,
      })
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, parentTaskId), eq(tasks.isArchived, false)));
    if (children.length === 0) return;
    // A parent only rolls up from effort-bearing children. Subtasks with no estimate yet say nothing about the work, so they
    // must not overwrite the parent's own baseline, approved and remaining estimates with nothing (spec section 3 and 6).
    const effortBearing = children.some((c) => c.baseline !== null || c.current !== null || c.remaining !== null);
    if (!effortBearing) return;

    const sum = (values: (number | null)[]): number | null => {
      const present = values.filter((v): v is number => v !== null);
      return present.length ? present.reduce((a, b) => a + b, 0) : null;
    };
    const rollup = {
      baselineEstimateMinutes: sum(children.map((c) => c.baseline)),
      currentEstimateMinutes: sum(children.map((c) => c.current)),
      remainingEstimateMinutes: sum(children.map((c) => c.remaining)),
    };

    const [parent] = await tx.select().from(tasks).where(eq(tasks.id, parentTaskId)).limit(1);
    if (!parent) return;
    const changed =
      parent.baselineEstimateMinutes !== rollup.baselineEstimateMinutes ||
      parent.currentEstimateMinutes !== rollup.currentEstimateMinutes ||
      parent.remainingEstimateMinutes !== rollup.remainingEstimateMinutes;
    if (!changed) return;

    await tx.update(tasks).set({ ...rollup, updatedAt: new Date() }).where(eq(tasks.id, parentTaskId));
    await this.audit.record(
      {
        workspaceId: parent.workspaceId,
        taskId: parentTaskId,
        userId: actorId,
        action: AuditAction.ESTIMATE_CHANGED,
        beforeValue: {
          rollup: true,
          baselineEstimateMinutes: parent.baselineEstimateMinutes,
          currentEstimateMinutes: parent.currentEstimateMinutes,
          remainingEstimateMinutes: parent.remainingEstimateMinutes,
        },
        afterValue: { rollup: true, ...rollup },
      },
      tx,
    );
  }

  // ── commands ──────────────────────────────────────────────────────────────

  async create(workspaceId: string, actor: Actor, input: CreateTaskInput): Promise<TaskDetail> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const assigneeIds = input.assigneeIds ?? [];
    const planningPeople = [input.ownerId, input.reviewerId].filter((id): id is string => !!id);
    const labelIds = input.labelIds ?? [];
    await this.assertAssigneesAreMembers(workspaceId, assigneeIds);
    await this.assertAssigneesAreMembers(workspaceId, planningPeople);
    if (input.ownerId && input.reviewerId && input.ownerId === input.reviewerId) {
      throw new BadRequestException('Owner and reviewer must be different people');
    }
    if (input.reviewerId && (input.status === 'IN_REVIEW' || input.status === 'DONE')) {
      throw new BadRequestException('Create reviewer-controlled tasks as To Do or In Progress');
    }
    await this.assertLabelsInWorkspace(workspaceId, labelIds);
    if (input.parentTaskId) {
      await this.assertParentEligible(workspaceId, input.projectId, input.parentTaskId);
    }

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
          parentTaskId: input.parentTaskId ?? null,
          number: seq.number,
          title: input.title,
          description: input.description ?? null,
          acceptanceCriteria: input.acceptanceCriteria ?? null,
          childScope: input.childScope ?? 'REQUIRED',
          status: input.status ?? 'TODO',
          priority: input.priority ?? 'MEDIUM',
          size: input.size,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          originalDueDate: input.dueDate ? new Date(input.dueDate) : null,
          ownerId: input.ownerId ?? null,
          reviewerId: input.reviewerId ?? null,
          baselineEstimateMinutes: input.baselineEstimateMinutes ?? null,
          currentEstimateMinutes: input.currentEstimateMinutes ?? input.baselineEstimateMinutes ?? null,
          remainingEstimateMinutes: input.remainingEstimateMinutes ?? input.currentEstimateMinutes ?? input.baselineEstimateMinutes ?? null,
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
            size: task.size,
            dueDate: task.dueDate?.toISOString() ?? null,
            assigneeIds,
            ownerId: input.ownerId ?? null,
            reviewerId: input.reviewerId ?? null,
            baselineEstimateMinutes: input.baselineEstimateMinutes ?? null,
          },
        },
        tx,
      );

      if (input.parentTaskId) {
        await this.recalcParentRollup(input.parentTaskId, actor.id, tx);
      }

      return { task, prefix: seq.prefix };
    });

    const detail = await this.getOne(created.task.id, actor);

    // Trigger Notification for assignees
    if (assigneeIds.length > 0) {
      const taskRef = detail.ref;
      for (const assigneeId of assigneeIds) {
        if (assigneeId !== actor.id) {
          void this.notifications.createNotification(
            assigneeId,
            actor.id,
            'TASK_ASSIGNED',
            'New Task Assigned',
            `You have been assigned to task ${taskRef}: "${detail.title}"`,
            { taskId: detail.id, workspaceId, taskRef },
          ).catch((err) => this.logger.error(`Failed to trigger notification: ${err.message}`));
        }
      }
    }

    return detail;
  }


  /** Convenience wrapper: creates a task as a subtask of `parentTaskId`, inheriting its workspace/project. */
  async createSubtask(parentTaskId: string, actor: Actor, input: CreateSubtaskInput): Promise<TaskDetail> {
    const parent = await this.loadTaskOrThrow(parentTaskId);
    await this.workspaces.assertCanAccess(parent.workspaceId, actor);
    if (parent.parentTaskId) {
      throw new BadRequestException('A subtask cannot itself have subtasks');
    }
    return this.create(parent.workspaceId, actor, {
      projectId: parent.projectId,
      parentTaskId: parent.id,
      title: input.title,
      size: 'SMALL',
      assigneeIds: input.assigneeIds,
      dueDate: input.dueDate,
    });
  }

  async list(workspaceId: string, actor: Actor, query: TaskQuery): Promise<Paginated<TaskListItem>> {
    await this.workspaces.assertCanAccess(workspaceId, actor);

    // Subtasks are shown nested under their parent (in the drawer), never as their own board row.
    const conds = [eq(tasks.workspaceId, workspaceId), isNull(tasks.parentTaskId)];
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
    if (query.attention) {
      const open = ne(tasks.status, 'DONE');
      switch (query.attention) {
        case 'NO_OWNER':
          conds.push(isNull(tasks.ownerId), open);
          break;
        case 'NO_DEADLINE':
          conds.push(isNull(tasks.dueDate), open);
          break;
        case 'MISSING_ESTIMATE':
          conds.push(isNull(tasks.baselineEstimateMinutes), open);
          break;
        case 'OVERDUE':
          conds.push(sql`${tasks.dueDate} < now()`, open);
          break;
        case 'BLOCKED': {
          const blocked = this.db.select({ id: taskBlockers.taskId }).from(taskBlockers).where(isNull(taskBlockers.unblockedAt));
          conds.push(inArray(tasks.id, blocked), open);
          break;
        }
        case 'REVIEW_OVERDUE': {
          // Waiting time is measured in scheduled working minutes, not wall-clock hours.
          const [policy] = await this.db.select().from(organisationPolicies).where(eq(organisationPolicies.id, 1));
          const cal = await this.calendar.get();
          const pending = await this.db
            .select({ taskId: taskSubmissions.taskId, submittedAt: taskSubmissions.submittedAt })
            .from(taskSubmissions)
            .innerJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
            .where(and(eq(taskSubmissions.status, 'PENDING'), eq(tasks.workspaceId, workspaceId)));
          const nowIso = new Date().toISOString();
          const target = policy?.reviewTargetMinutes ?? 480;
          const late = cal.settings
            ? pending.filter((r) => workingMinutesElapsed(r.submittedAt.toISOString(), nowIso, cal.settings!, cal.exceptions) >= target).map((r) => r.taskId)
            : [];
          conds.push(late.length ? inArray(tasks.id, late) : sql`false`);
          break;
        }
      }
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

    const [rel, people, calendar] = await Promise.all([
      this.loadRelations(rows.map((r) => r.task.id)),
      this.userRefs(rows.flatMap((r) => [r.task.ownerId, r.task.reviewerId])),
      this.calendar.get(),
    ]);
    const now = new Date();
    return {
      items: rows.map((r) => this.toListItem(r.task, r.prefix, r.projectName, rel, people, calendar, now)),
      total: Number(total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getOne(taskId: string, actor: Actor): Promise<TaskDetail> {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const [rel, people, calendar] = await Promise.all([
      this.loadRelations([taskId]),
      this.userRefs([task.ownerId, task.reviewerId]),
      this.calendar.get(),
    ]);
    const base = this.toListItem(task, task.taskPrefix, task.projectName, rel, people, calendar, new Date());
    const createdBy = await this.userRef(task.createdById);

    const subtaskRows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.parentTaskId, taskId))
      .orderBy(asc(tasks.createdAt));
    const [subtaskRefs, parentRefs] = await Promise.all([
      this.subtaskRefsFor(subtaskRows.map((r) => r.id)),
      task.parentTaskId ? this.subtaskRefsFor([task.parentTaskId]) : Promise.resolve(new Map<string, SubtaskRef>()),
    ]);
    const subtasks = subtaskRows.map((r) => subtaskRefs.get(r.id)).filter((s): s is SubtaskRef => !!s);
    const parentTask = task.parentTaskId ? (parentRefs.get(task.parentTaskId) ?? null) : null;

    return { ...base, description: task.description, createdBy, parentTask, subtasks };
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
    const planningPeople = [input.ownerId, input.reviewerId].filter((id): id is string => !!id);
    if (planningPeople.length) await this.assertAssigneesAreMembers(current.workspaceId, planningPeople);
    const nextOwner = input.ownerId === undefined ? current.ownerId : input.ownerId;
    const nextReviewer = input.reviewerId === undefined ? current.reviewerId : input.reviewerId;
    if (nextOwner && nextReviewer && nextOwner === nextReviewer) {
      throw new BadRequestException('Owner and reviewer must be different people');
    }
    if ((input.status !== undefined || input.reviewerId !== undefined) &&
        (input.status !== current.status || input.reviewerId !== current.reviewerId)) {
      const [pendingReview] = await this.db.select({ id: taskSubmissions.id }).from(taskSubmissions)
        .where(and(eq(taskSubmissions.taskId, taskId), eq(taskSubmissions.status, 'PENDING'))).limit(1);
      if (pendingReview) throw new BadRequestException('Decide the pending submission before changing its status or reviewer');
    }
    if (input.labelIds) await this.assertLabelsInWorkspace(current.workspaceId, input.labelIds);

    if (input.currentEstimateMinutes !== undefined || input.remainingEstimateMinutes !== undefined) {
      const childEstimates = await this.db
        .select({
          baseline: tasks.baselineEstimateMinutes,
          current: tasks.currentEstimateMinutes,
          remaining: tasks.remainingEstimateMinutes,
        })
        .from(tasks)
        .where(and(eq(tasks.parentTaskId, taskId), eq(tasks.isArchived, false)));
      const hasEffortBearingChildren = childEstimates.some(
        (c) => c.baseline !== null || c.current !== null || c.remaining !== null,
      );
      if (hasEffortBearingChildren) {
        throw new BadRequestException(
          "This task's effort rolls up from its subtasks; edit estimates on the subtasks instead.",
        );
      }
    }

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
      const audits: { action: AuditAction; before: unknown; after: unknown; reason?: string }[] = [];

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
      if (input.acceptanceCriteria !== undefined && (input.acceptanceCriteria ?? null) !== current.acceptanceCriteria) {
        patch.acceptanceCriteria = input.acceptanceCriteria ?? null;
        audits.push({ action: AuditAction.DESCRIPTION_CHANGED, before: { acceptanceCriteria: current.acceptanceCriteria }, after: { acceptanceCriteria: input.acceptanceCriteria ?? null } });
      }
      if (input.childScope !== undefined && input.childScope !== current.childScope) {
        patch.childScope = input.childScope;
        audits.push({ action: AuditAction.DESCRIPTION_CHANGED, before: { childScope: current.childScope }, after: { childScope: input.childScope } });
      }
      if (input.status !== undefined && input.status !== current.status) {
        if (current.reviewerId && (input.status === 'IN_REVIEW' || input.status === 'DONE')) {
          throw new BadRequestException('Use the evidence submission and review workflow for this status');
        }
        if (!current.reviewerId && !current.parentTaskId && input.status === 'DONE') {
          await this.assertSimplifiedDoneAllowed(current.currentEstimateMinutes ?? current.baselineEstimateMinutes);
        }
        patch.status = input.status;
        // Track completion time for analytics; a re-opened task no longer counts as completed.
        patch.completedAt = input.status === 'DONE' ? new Date() : null;
        audits.push({ action: AuditAction.STATUS_CHANGED, before: current.status, after: input.status });
      }
      if (input.priority !== undefined && input.priority !== current.priority) {
        patch.priority = input.priority;
        audits.push({ action: AuditAction.PRIORITY_CHANGED, before: current.priority, after: input.priority });
      }
      if (input.size !== undefined && input.size !== current.size) {
        patch.size = input.size;
        audits.push({ action: AuditAction.DESCRIPTION_CHANGED, before: { size: current.size }, after: { size: input.size } });
      }
      if (input.dueDate !== undefined) {
        const nextDue = input.dueDate ? new Date(input.dueDate) : null;
        const currentIso = current.dueDate ? current.dueDate.toISOString() : null;
        const nextIso = nextDue ? nextDue.toISOString() : null;
        if (currentIso !== nextIso) {
          // Moving or clearing an existing commitment needs a reason (PRD §2); setting the first date does not.
          if (current.dueDate && !input.dueDateReason) {
            throw new BadRequestException('A reason is required when changing an existing due date');
          }
          patch.dueDate = nextDue;
          // The first non-null commitment becomes the immutable baseline for
          // deadline-revision reporting, including legacy undated tasks.
          if (!current.originalDueDate && nextDue) patch.originalDueDate = nextDue;
          audits.push({ action: AuditAction.DUE_DATE_CHANGED, before: currentIso, after: nextIso, reason: input.dueDateReason });
        }
      }
      if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
        patch.ownerId = input.ownerId;
        audits.push({ action: AuditAction.OWNER_CHANGED, before: current.ownerId, after: input.ownerId });
      }
      if (input.reviewerId !== undefined && input.reviewerId !== current.reviewerId) {
        patch.reviewerId = input.reviewerId;
        audits.push({ action: AuditAction.REVIEWER_CHANGED, before: current.reviewerId, after: input.reviewerId });
      }
      for (const field of ['currentEstimateMinutes', 'remainingEstimateMinutes'] as const) {
        if (input[field] !== undefined && input[field] !== current[field]) {
          patch[field] = input[field];
          audits.push({ action: AuditAction.ESTIMATE_CHANGED, before: { field, value: current[field] }, after: { field, value: input[field] } });
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
            afterValue: a.reason ? { value: a.after, reason: a.reason } : a.after,
          },
          tx,
        );
      }

      if (current.parentTaskId && (patch.currentEstimateMinutes !== undefined || patch.remainingEstimateMinutes !== undefined)) {
        await this.recalcParentRollup(current.parentTaskId, actor.id, tx);
      }
    });

    const detail = await this.getOne(taskId, actor);

    // Trigger Notification for new assignees
    if (input.assigneeIds) {
      const addedAssignees = input.assigneeIds.filter((id) => !currentAssignees.includes(id));
      for (const assigneeId of addedAssignees) {
        if (assigneeId !== actor.id) {
          void this.notifications.createNotification(
            assigneeId,
            actor.id,
            'TASK_ASSIGNED',
            'New Task Assigned',
            `You have been assigned to task ${detail.ref}: "${detail.title}"`,
            { taskId, workspaceId: current.workspaceId, taskRef: detail.ref },
          ).catch((err) => this.logger.error(`Failed to trigger notification: ${err.message}`));
        }
      }
    }

    // Trigger Notification for status changes
    if (input.status !== undefined && input.status !== current.status) {
      const taskAssigneesList = detail.assignees;
      for (const assignee of taskAssigneesList) {
        if (assignee.id !== actor.id) {
          void this.notifications.createNotification(
            assignee.id,
            actor.id,
            'TASK_STATUS_CHANGED',
            'Task Status Updated',
            `Task ${detail.ref} status was updated to "${input.status}"`,
            { taskId, workspaceId: current.workspaceId, taskRef: detail.ref },
          ).catch((err) => this.logger.error(`Failed to trigger notification: ${err.message}`));
        }
      }
    }

    return detail;
  }

  async listSubmissions(taskId: string, actor: Actor): Promise<TaskSubmission[]> {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const rows = await this.db.select().from(taskSubmissions).where(eq(taskSubmissions.taskId, taskId)).orderBy(desc(taskSubmissions.submittedAt));
    const people = await this.userRefs(rows.flatMap((r) => [r.submitterId, r.reviewerId]));
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      note: r.note,
      status: r.status as TaskSubmission['status'],
      evidenceAttachmentId: r.evidenceAttachmentId,
      submitter: people.get(r.submitterId)!,
      reviewer: r.reviewerId ? (people.get(r.reviewerId) ?? null) : null,
      reviewNote: r.reviewNote,
      submittedAt: r.submittedAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
    }));
  }

  async submitForReview(taskId: string, actor: Actor, input: SubmitTaskInput): Promise<TaskSubmission> {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    if (task.isArchived || task.status === 'DONE') throw new BadRequestException('This task cannot be submitted');
    if (!task.reviewerId) throw new BadRequestException('Assign a reviewer before submitting');
    const [assignee] = await this.db.select({ userId: taskAssignees.userId }).from(taskAssignees)
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, actor.id))).limit(1);
    if (actor.role !== Role.ADMIN && task.ownerId !== actor.id && !assignee) {
      throw new ForbiddenException('Only the accountable owner or a tagged contributor can submit this task');
    }
    const [evidence] = await this.db.select({ id: taskAttachments.id }).from(taskAttachments)
      .where(and(eq(taskAttachments.id, input.evidenceAttachmentId), eq(taskAttachments.taskId, taskId))).limit(1);
    if (!evidence) throw new BadRequestException('Select evidence attached to this task');
    const [pending] = await this.db.select({ id: taskSubmissions.id }).from(taskSubmissions)
      .where(and(eq(taskSubmissions.taskId, taskId), eq(taskSubmissions.status, 'PENDING'))).limit(1);
    if (pending) throw new BadRequestException('This task already has a pending review');

    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(taskSubmissions).values({ taskId, submitterId: actor.id, evidenceAttachmentId: evidence.id, note: input.note }).returning();
      await tx.update(tasks).set({ status: 'IN_REVIEW', completedAt: null, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      await this.audit.record({ workspaceId: task.workspaceId, taskId, userId: actor.id, action: AuditAction.SUBMITTED, afterValue: { submissionId: created!.id, evidenceAttachmentId: evidence.id, note: input.note } }, tx);
      return created!;
    });
    return (await this.listSubmissions(taskId, actor)).find((s) => s.id === row.id)!;
  }

  /**
   * The active reviewer-delegate for a task at a point in time, if any (PRD
   * §9 "Reviewer delegate" — a bounded, effective-dated scope, not a standing
   * role). Most-recently-created wins if spans somehow overlap.
   */
  private async activeDelegateFor(taskId: string, at: Date): Promise<string | null> {
    const rows = await this.db
      .select({ delegateId: reviewerDelegations.delegateId })
      .from(reviewerDelegations)
      .where(
        and(
          eq(reviewerDelegations.taskId, taskId),
          lte(reviewerDelegations.effectiveFrom, at),
          gte(reviewerDelegations.effectiveTo, at),
        ),
      )
      .orderBy(desc(reviewerDelegations.createdAt))
      .limit(1);
    return rows[0]?.delegateId ?? null;
  }

  /** Only the current reviewer, an admin, or a workspace manager can hand off review authority. */
  async delegateReview(taskId: string, actor: Actor, input: DelegateReviewInput): Promise<{ id: string; delegateId: string; effectiveFrom: string; effectiveTo: string; reason: string }> {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    if (
      actor.role !== Role.ADMIN &&
      task.reviewerId !== actor.id &&
      !(await this.workspaces.isManager(task.workspaceId, actor))
    ) {
      throw new ForbiddenException('Only the assigned reviewer, an admin, or a workspace manager can delegate review');
    }
    if (input.delegateId === task.reviewerId) {
      throw new BadRequestException('The delegate must be different from the assigned reviewer');
    }
    const [delegateIsMember] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, task.workspaceId), eq(workspaceMembers.userId, input.delegateId)))
      .limit(1);
    if (!delegateIsMember) throw new BadRequestException('The delegate must be a member of this workspace');

    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(reviewerDelegations)
        .values({
          taskId,
          delegatorId: actor.id,
          delegateId: input.delegateId,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: new Date(input.effectiveTo),
          reason: input.reason,
        })
        .returning();
      if (!created) throw new Error('Failed to record delegation');
      await this.audit.record(
        {
          workspaceId: task.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.REVIEW_DELEGATED,
          afterValue: { delegateId: input.delegateId, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, reason: input.reason },
        },
        tx,
      );
      return created;
    });
    return {
      id: row.id,
      delegateId: row.delegateId,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo.toISOString(),
      reason: row.reason,
    };
  }

  async listDelegations(taskId: string, actor: Actor) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const rows = await this.db.select().from(reviewerDelegations).where(eq(reviewerDelegations.taskId, taskId)).orderBy(desc(reviewerDelegations.createdAt));
    const people = await this.userRefs(rows.flatMap((r) => [r.delegatorId, r.delegateId]));
    return rows.map((r) => ({
      id: r.id,
      delegator: people.get(r.delegatorId)!,
      delegate: people.get(r.delegateId)!,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo.toISOString(),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Pending submissions the actor may decide: as assigned reviewer, as an active
   * delegate, or (admin) everything. Waiting time is counted in working minutes
   * so a Friday-evening submission doesn't look three days stale on Monday.
   */
  async reviewQueue(actor: Actor): Promise<ReviewQueueItem[]> {
    const now = new Date();
    const rows = await this.db
      .select({ sub: taskSubmissions, task: tasks, workspaceName: workspaces.name, prefix: projects.taskPrefix, projectName: projects.name })
      .from(taskSubmissions)
      .innerJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
      .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(taskSubmissions.status, 'PENDING'), eq(tasks.isArchived, false)))
      .orderBy(asc(taskSubmissions.submittedAt));
    const taskIds = rows.map((r) => r.task.id);
    const delegations = taskIds.length
      ? await this.db.select().from(reviewerDelegations).where(and(inArray(reviewerDelegations.taskId, taskIds), lte(reviewerDelegations.effectiveFrom, now), gte(reviewerDelegations.effectiveTo, now))).orderBy(desc(reviewerDelegations.createdAt))
      : [];
    const activeDelegation = new Map<string, (typeof delegations)[number]>();
    for (const d of delegations) if (!activeDelegation.has(d.taskId)) activeDelegation.set(d.taskId, d);
    const managerCache = new Map<string, boolean>();
    const visible: typeof rows = [];
    for (const r of rows) {
      const delegation = activeDelegation.get(r.task.id);
      let ok = actor.role === Role.ADMIN || r.task.reviewerId === actor.id || delegation?.delegateId === actor.id;
      if (!ok) {
        if (!managerCache.has(r.task.workspaceId)) managerCache.set(r.task.workspaceId, await this.workspaces.isManager(r.task.workspaceId, actor));
        ok = managerCache.get(r.task.workspaceId)!;
      }
      if (ok) visible.push(r);
    }
    const visibleTaskIds = visible.map((r) => r.task.id);
    const evidenceIds = visible.map((r) => r.sub.evidenceAttachmentId);
    const [people, cal, evidenceRows, returnedRows] = await Promise.all([
      this.userRefs(visible.flatMap((r) => [r.sub.submitterId, r.task.reviewerId, activeDelegation.get(r.task.id)?.delegatorId ?? null])),
      this.calendar.get(),
      evidenceIds.length ? this.db.select({ id: taskAttachments.id, fileName: taskAttachments.fileName }).from(taskAttachments).where(inArray(taskAttachments.id, evidenceIds)) : Promise.resolve([]),
      visibleTaskIds.length
        ? this.db.select({ taskId: taskSubmissions.taskId, reason: taskSubmissions.reviewNote, decidedAt: taskSubmissions.decidedAt }).from(taskSubmissions)
            .where(and(inArray(taskSubmissions.taskId, visibleTaskIds), eq(taskSubmissions.status, 'RETURNED'))).orderBy(desc(taskSubmissions.decidedAt))
        : Promise.resolve([]),
    ]);
    const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));
    const returnsByTask = new Map<string, Array<{ reason: string; decidedAt: string }>>();
    for (const rr of returnedRows) {
      if (!rr.decidedAt) continue;
      const list = returnsByTask.get(rr.taskId) ?? [];
      list.push({ reason: rr.reason ?? '', decidedAt: rr.decidedAt.toISOString() });
      returnsByTask.set(rr.taskId, list);
    }
    return visible.map((r) => {
      const d = activeDelegation.get(r.task.id);
      return {
        submissionId: r.sub.id,
        taskId: r.task.id,
        taskRef: this.ref(r.prefix, r.task.number),
        taskTitle: r.task.title,
        workspaceId: r.task.workspaceId,
        workspaceName: r.workspaceName,
        submitter: people.get(r.sub.submitterId)!,
        reviewer: r.task.reviewerId ? people.get(r.task.reviewerId) ?? null : null,
        delegatedBy: d && d.delegateId === actor.id && r.task.reviewerId !== actor.id ? people.get(d.delegatorId) ?? null : null,
        submittedAt: r.sub.submittedAt.toISOString(),
        waitingWorkingMinutes: cal.settings ? workingMinutesElapsed(r.sub.submittedAt.toISOString(), now.toISOString(), cal.settings, cal.exceptions) : null,
        waitingWallMinutes: Math.max(0, Math.round((now.getTime() - r.sub.submittedAt.getTime()) / 60000)),
        projectName: r.projectName,
        dueDate: r.task.dueDate ? r.task.dueDate.toISOString() : null,
        deliveryNote: r.sub.note,
        evidence: evidenceById.get(r.sub.evidenceAttachmentId) ?? null,
        priorReturns: returnsByTask.get(r.task.id) ?? [],
      };
    });
  }

  async reviewSubmission(taskId: string, submissionId: string, actor: Actor, input: ReviewTaskInput): Promise<TaskSubmission> {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const now = new Date();
    const activeDelegateId = await this.activeDelegateFor(taskId, now);
    // A workspace MANAGER can decide any submission in their assigned workspace
    // (PRD §9 "Team manager": reviews), not only tasks where they're the literal
    // assigned reviewer — a global admin retains that authority everywhere too.
    // An active, effective-dated reviewer delegate (PRD §9) can decide it too,
    // scoped to exactly this task and only while their delegation is in effect.
    if (
      actor.role !== Role.ADMIN &&
      task.reviewerId !== actor.id &&
      activeDelegateId !== actor.id &&
      !(await this.workspaces.isManager(task.workspaceId, actor))
    ) {
      throw new ForbiddenException('Only the assigned reviewer, an active delegate, or a workspace manager can decide this submission');
    }
    const [submission] = await this.db.select().from(taskSubmissions)
      .where(and(eq(taskSubmissions.id, submissionId), eq(taskSubmissions.taskId, taskId))).limit(1);
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status !== 'PENDING') throw new BadRequestException('This submission has already been decided');
    await this.db.transaction(async (tx) => {
      await tx.update(taskSubmissions).set({ status: input.decision, reviewerId: actor.id, reviewNote: input.note ?? null, decidedAt: now }).where(eq(taskSubmissions.id, submissionId));
      await tx.update(tasks).set({ status: input.decision === 'ACCEPTED' ? 'DONE' : 'IN_PROGRESS', completedAt: input.decision === 'ACCEPTED' ? now : null, updatedAt: now }).where(eq(tasks.id, taskId));
      await this.audit.record({ workspaceId: task.workspaceId, taskId, userId: actor.id, action: AuditAction.REVIEWED, beforeValue: { submissionId, status: 'PENDING' }, afterValue: { decision: input.decision, note: input.note ?? null } }, tx);
    });
    return (await this.listSubmissions(taskId, actor)).find((s) => s.id === submissionId)!;
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
      if (current.parentTaskId) await this.recalcParentRollup(current.parentTaskId, actor.id, tx);
    });
    return { id: taskId, isArchived: true };
  }

  /** Recoverable: un-hides a previously archived task. */
  async restore(taskId: string, actor: Actor): Promise<{ id: string; isArchived: boolean }> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);
    if (!current.isArchived) return { id: taskId, isArchived: false };
    await this.db.transaction(async (tx) => {
      await tx.update(tasks).set({ isArchived: false, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      if (current.parentTaskId) await this.recalcParentRollup(current.parentTaskId, actor.id, tx);
    });
    return { id: taskId, isArchived: false };
  }

  /**
   * Permanent, irreversible delete — admin-only. Cascades to the task's own
   * subtasks/comments/attachments/assignees/labels at the DB level; audit rows
   * referencing this task survive with `taskId` set to null (ON DELETE SET NULL).
   */
  async remove(taskId: string, actor: Actor): Promise<{ id: string }> {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an admin can permanently delete a task');
    }
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);

    const subtaskRows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.parentTaskId, taskId));
    const idsToClean = [taskId, ...subtaskRows.map((r) => r.id)];
    // Links carry no bytes — only FILE rows have something to unlink from disk.
    const attachmentRows = await this.db
      .select({ storageKey: taskAttachments.storageKey })
      .from(taskAttachments)
      .where(
        and(
          inArray(taskAttachments.taskId, idsToClean),
          eq(taskAttachments.kind, AttachmentKind.FILE),
        ),
      );

    await this.db.transaction(async (tx) => {
      await this.audit.record(
        {
          workspaceId: current.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.DELETED,
          beforeValue: { title: current.title, ref: this.ref(current.taskPrefix, current.number) },
        },
        tx,
      );
      await tx.delete(tasks).where(eq(tasks.id, taskId));
      if (current.parentTaskId) await this.recalcParentRollup(current.parentTaskId, actor.id, tx);
    });

    // After commit; missing files are tolerated (mirrors removeAttachment).
    await Promise.all(
      attachmentRows
        .filter((a): a is { storageKey: string } => !!a.storageKey)
        .map((a) => this.files.remove(a.storageKey).catch(() => undefined)),
    );
    return { id: taskId };
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
    const commentDetail = { id: comment.id, body: comment.body, user, createdAt: comment.createdAt.toISOString() };

    // Trigger Notification for comment in the background
    void (async () => {
      try {
        const assigneeRows = await this.db
          .select({ userId: taskAssignees.userId })
          .from(taskAssignees)
          .where(eq(taskAssignees.taskId, taskId));
        const assigneeIds = assigneeRows.map((r) => r.userId);

        const previousCommentersRows = await this.db
          .select({ userId: taskComments.userId })
          .from(taskComments)
          .where(eq(taskComments.taskId, taskId));
        const previousCommenterIds = previousCommentersRows.map((r) => r.userId);

        const recipients = new Set<string>([
          ...assigneeIds,
          current.createdById,
          ...previousCommenterIds,
        ]);
        recipients.delete(actor.id); // Don't notify the actor who commented

        const taskRef = this.ref(current.taskPrefix, current.number);

        for (const recipientId of recipients) {
          await this.notifications.createNotification(
            recipientId,
            actor.id,
            'TASK_COMMENT',
            'New Comment on Task',
            `New comment from ${user.name} on task ${taskRef}: "${current.title}"`,
            { taskId, workspaceId: current.workspaceId, commentId: comment.id, taskRef },
          );
        }
      } catch (err: any) {
        this.logger.error(`Failed to trigger comment notifications: ${err.message}`);
      }
    })();

    return commentDetail;
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

  /** Row -> discriminated union. The DB CHECK guarantees the per-kind columns are populated. */
  private toAttachment(row: TaskAttachmentRow, uploader: UserRef): TaskAttachment {
    const base = {
      id: row.id,
      fileName: row.fileName,
      uploader,
      createdAt: row.createdAt.toISOString(),
    };
    if (row.kind === AttachmentKind.LINK) {
      return { ...base, kind: AttachmentKind.LINK, url: row.url!, mimeType: null, sizeBytes: null, storageKey: null };
    }
    return {
      ...base,
      kind: AttachmentKind.FILE,
      mimeType: row.mimeType!,
      sizeBytes: row.sizeBytes!,
      storageKey: row.storageKey!,
      url: null,
    };
  }

  async listAttachments(taskId: string, actor: Actor): Promise<TaskAttachment[]> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);
    const rows = await this.db
      .select({
        attachment: taskAttachments,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatarKey: users.avatarKey,
      })
      .from(taskAttachments)
      .innerJoin(users, eq(users.id, taskAttachments.uploaderId))
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(asc(taskAttachments.createdAt));
    return rows.map((r) =>
      this.toAttachment(r.attachment, {
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
        avatarKey: r.userAvatarKey,
      }),
    );
  }

  /**
   * Attach an external link (Figma, Docs, …). The URL is stored verbatim and never
   * fetched server-side — previews are rendered client-side from the URL alone, so
   * there is no SSRF surface here. Scheme is restricted to http(s) by the DTO.
   */
  async addLinkAttachment(
    taskId: string,
    actor: Actor,
    input: CreateLinkAttachmentInput,
  ): Promise<TaskAttachment> {
    const current = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(current.workspaceId, actor);

    // Defence in depth: the DTO already rejects non-http(s), but this is what
    // guards the href/iframe that eventually renders it.
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw new BadRequestException('Link must be a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Link must be an http(s) URL');
    }

    const title = (input.title?.trim() || parsed.hostname.replace(/^www\./, '')).slice(0, 255);

    const row = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(taskAttachments)
        .values({
          taskId,
          uploaderId: actor.id,
          kind: AttachmentKind.LINK,
          fileName: title,
          url: parsed.toString(),
        })
        .returning();
      if (!inserted) throw new Error('Failed to save link');
      await this.audit.record(
        {
          workspaceId: current.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.ATTACHMENT_ADDED,
          afterValue: { attachmentId: inserted.id, fileName: title, url: inserted.url },
        },
        tx,
      );
      return inserted;
    });

    return this.toAttachment(row, await this.userRef(actor.id));
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
            kind: AttachmentKind.FILE,
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
      return this.toAttachment(row, await this.userRef(actor.id));
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
    const [usedAsEvidence] = await this.db.select({ id: taskSubmissions.id }).from(taskSubmissions)
      .where(eq(taskSubmissions.evidenceAttachmentId, attachmentId)).limit(1);
    if (usedAsEvidence) throw new BadRequestException('Evidence used in a submission cannot be deleted');

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
    // After commit; missing files are tolerated. Links have no bytes on disk.
    if (attachment.storageKey) {
      await this.files.remove(attachment.storageKey).catch(() => undefined);
    }
    return { id: attachmentId };
  }

  /**
   * Authorized lookup used by the file-serving route. Only FILE rows have a
   * storage key, so the kind filter both scopes the query and lets us hand back
   * the non-null mime/name the route needs.
   */
  async attachmentByStorageKey(
    storageKey: string,
    actor: Actor,
  ): Promise<{ fileName: string; mimeType: string }> {
    const [row] = await this.db
      .select({
        fileName: taskAttachments.fileName,
        mimeType: taskAttachments.mimeType,
        workspaceId: tasks.workspaceId,
      })
      .from(taskAttachments)
      .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
      .where(
        and(
          eq(taskAttachments.storageKey, storageKey),
          eq(taskAttachments.kind, AttachmentKind.FILE),
        ),
      )
      .limit(1);
    if (!row?.mimeType) throw new NotFoundException('File not found');
    await this.workspaces.assertCanAccess(row.workspaceId, actor);
    return { fileName: row.fileName, mimeType: row.mimeType };
  }

  // ── Time Entries & Forecast calculations (E01) ──────────────────────────────

  private async officeTimezone(): Promise<string> {
    return (await this.calendar.get()).settings?.timezone ?? 'Asia/Kolkata';
  }

  /**
   * One person cannot be working two intervals at once. Zero-length rows are the
   * legacy duration-only entries (started == ended) and carry no interval, so
   * they are ignored; a running timer counts up to `now`.
   */
  private async assertNoTimeOverlap(
    db: Pick<Database, 'select'>,
    userId: string,
    start: Date,
    end: Date,
    now: Date,
  ): Promise<void> {
    const rows = await db
      .select({ id: taskTimeEntries.id, startedAt: taskTimeEntries.startedAt, endedAt: taskTimeEntries.endedAt })
      .from(taskTimeEntries)
      .where(and(eq(taskTimeEntries.userId, userId), sql`${taskTimeEntries.startedAt} IS NOT NULL`));
    for (const r of rows) {
      const rStart = r.startedAt!;
      const rEnd = r.endedAt ?? now;
      if (rEnd.getTime() <= rStart.getTime()) continue;
      if (intervalsOverlap(start, end, rStart, rEnd)) {
        throw new BadRequestException(
          `This time overlaps another entry (${rStart.toISOString()} – ${r.endedAt ? rEnd.toISOString() : 'running'}). Adjust the times or stop the other timer.`,
        );
      }
    }
  }

  async logTimeEntry(
    taskId: string,
    actor: Actor,
    input: { workDate: string; durationMinutes: number; startedAt?: string; category?: string; note?: string },
  ) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const now = new Date();
    const category = input.category ?? 'EXECUTION';

    // Interval-bearing entry: overlap-checked and split at office-local midnight.
    let rows: { workDate: string; durationMinutes: number; startedAt: Date; endedAt: Date }[];
    if (input.startedAt) {
      const start = new Date(input.startedAt);
      const end = new Date(start.getTime() + input.durationMinutes * 60000);
      if (end.getTime() > now.getTime() + 60000) throw new BadRequestException('Time cannot be logged for a period that has not happened yet');
      const segments = splitAcrossLocalDays(start, end, await this.officeTimezone());
      const parts = apportionMinutes(input.durationMinutes, segments);
      rows = segments.map((seg, i) => ({ workDate: seg.workDate, durationMinutes: parts[i]!, startedAt: seg.startedAt, endedAt: seg.endedAt }));
    } else {
      rows = [{ workDate: input.workDate, durationMinutes: input.durationMinutes, startedAt: now, endedAt: now }];
    }

    return await this.db.transaction(async (tx) => {
      if (input.startedAt) {
        // Serialise per user so two concurrent logs cannot both pass the check.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`);
        await this.assertNoTimeOverlap(tx, actor.id, rows[0]!.startedAt, rows[rows.length - 1]!.endedAt, now);
      }
      const entries = await tx
        .insert(taskTimeEntries)
        .values(rows.map((r) => ({ taskId, userId: actor.id, workDate: r.workDate, durationMinutes: r.durationMinutes, category, note: input.note ?? null, startedAt: r.startedAt, endedAt: r.endedAt })))
        .returning();

      // Remaining effort is the owner's explicit forecast. Logged time is actual
      // effort, not a progress signal, so it must never silently lower that forecast.

      await this.audit.record(
        {
          workspaceId: task.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.TIME_ENTRY_CREATED,
          afterValue: { entryId: entries[0]!.id, entryIds: entries.map((e) => e.id), durationMinutes: input.durationMinutes, category },
        },
        tx,
      );

      // Callers get the first row; a cross-midnight log also returns every part.
      return { ...entries[0]!, parts: entries };
    });
  }

  async startTimer(taskId: string, actor: Actor, input: { category?: string; note?: string }) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);

    // Check for existing running timer for user
    const [running] = await this.db
      .select({ id: taskTimeEntries.id })
      .from(taskTimeEntries)
      .where(and(eq(taskTimeEntries.userId, actor.id), isNull(taskTimeEntries.endedAt)))
      .limit(1);
    if (running) {
      throw new BadRequestException('You already have an active timer running. Stop it before starting a new one.');
    }

    const now = new Date();
    // A timer starting inside an already-logged interval would double-count that time.
    await this.assertNoTimeOverlap(this.db, actor.id, now, new Date(now.getTime() + 1), now);
    const [entry] = await this.db
      .insert(taskTimeEntries)
      .values({
        taskId,
        userId: actor.id,
        workDate: localWorkDate(now, await this.officeTimezone()),
        durationMinutes: 0,
        category: input.category ?? 'EXECUTION',
        note: input.note ?? null,
        startedAt: now,
        endedAt: null,
        isPaused: false,
      })
      .returning();

    return entry;
  }

  /** The caller's open timer, if any (used by attendance check-out). */
  async findRunningTimer(userId: string) {
    const [row] = await this.db
      .select({ taskId: taskTimeEntries.taskId, taskTitle: tasks.title, startedAt: taskTimeEntries.startedAt, isPaused: taskTimeEntries.isPaused })
      .from(taskTimeEntries)
      .innerJoin(tasks, eq(tasks.id, taskTimeEntries.taskId))
      .where(and(eq(taskTimeEntries.userId, userId), isNull(taskTimeEntries.endedAt)))
      .limit(1);
    if (!row || !row.startedAt) return null;
    return { taskId: row.taskId, taskTitle: row.taskTitle, startedAt: row.startedAt.toISOString(), isPaused: row.isPaused };
  }

  private async loadRunningTimer(taskId: string, actor: Actor) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const [running] = await this.db
      .select()
      .from(taskTimeEntries)
      .where(and(eq(taskTimeEntries.taskId, taskId), eq(taskTimeEntries.userId, actor.id), isNull(taskTimeEntries.endedAt)))
      .limit(1);
    if (!running || !running.startedAt) {
      throw new NotFoundException('No active timer running for this task');
    }
    return { task, running };
  }

  async pauseTimer(taskId: string, actor: Actor) {
    const { running } = await this.loadRunningTimer(taskId, actor);
    if (running.isPaused) throw new BadRequestException('This timer is already paused');
    const now = new Date();
    const [updated] = await this.db
      .update(taskTimeEntries)
      .set({ isPaused: true, pausedAt: now, updatedAt: now })
      .where(eq(taskTimeEntries.id, running.id))
      .returning();
    return updated;
  }

  async resumeTimer(taskId: string, actor: Actor) {
    const { running } = await this.loadRunningTimer(taskId, actor);
    if (!running.isPaused || !running.pausedAt) throw new BadRequestException('This timer is not paused');
    const now = new Date();
    const [updated] = await this.db
      .update(taskTimeEntries)
      .set({ isPaused: false, pausedAt: null, pausedMs: running.pausedMs + Math.max(0, now.getTime() - running.pausedAt.getTime()), updatedAt: now })
      .where(eq(taskTimeEntries.id, running.id))
      .returning();
    return updated;
  }

  async stopTimer(taskId: string, actor: Actor) {
    const { task, running } = await this.loadRunningTimer(taskId, actor);
    const startedAt = running.startedAt!;

    const now = new Date();
    // Time spent paused (including a pause still open at stop) is not effort.
    const openPauseMs = running.isPaused && running.pausedAt ? Math.max(0, now.getTime() - running.pausedAt.getTime()) : 0;
    const activeMs = Math.max(0, now.getTime() - startedAt.getTime() - running.pausedMs - openPauseMs);
    const elapsedMinutes = Math.max(1, Math.round(activeMs / 60000));
    const segments = splitAcrossLocalDays(startedAt, now, await this.officeTimezone());
    const parts = apportionMinutes(elapsedMinutes, segments);

    return await this.db.transaction(async (tx) => {
      // The original row keeps the first day's slice; later days get their own rows.
      const first = segments[0] ?? { workDate: running.workDate, startedAt, endedAt: now };
      const [updated] = await tx
        .update(taskTimeEntries)
        .set({
          workDate: first.workDate,
          durationMinutes: parts[0] ?? elapsedMinutes,
          startedAt: first.startedAt,
          endedAt: first.endedAt,
          isPaused: false,
          pausedAt: null,
          updatedAt: now,
        })
        .where(eq(taskTimeEntries.id, running.id))
        .returning();
      const extra = segments.slice(1);
      if (extra.length) {
        await tx.insert(taskTimeEntries).values(
          extra.map((seg, i) => ({
            taskId,
            userId: actor.id,
            workDate: seg.workDate,
            durationMinutes: parts[i + 1]!,
            category: running.category,
            note: running.note,
            startedAt: seg.startedAt,
            endedAt: seg.endedAt,
          })),
        );
      }

      // As with manual entries, stopping a timer records actual effort only.
      // The owner updates remaining effort explicitly when their forecast changes.

      await this.audit.record(
        {
          workspaceId: task.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.TIME_ENTRY_CREATED,
          afterValue: { entryId: running.id, durationMinutes: elapsedMinutes, days: segments.length },
        },
        tx,
      );

      return updated;
    });
  }

  async getTimeSummary(taskId: string, actor: Actor) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);

    const entries = await this.db
      .select({
        id: taskTimeEntries.id,
        workDate: taskTimeEntries.workDate,
        durationMinutes: taskTimeEntries.durationMinutes,
        category: taskTimeEntries.category,
        note: taskTimeEntries.note,
        startedAt: taskTimeEntries.startedAt,
        endedAt: taskTimeEntries.endedAt,
        isPaused: taskTimeEntries.isPaused,
        pausedAt: taskTimeEntries.pausedAt,
        pausedMs: taskTimeEntries.pausedMs,
        userId: taskTimeEntries.userId,
        userName: users.name,
      })
      .from(taskTimeEntries)
      .innerJoin(users, eq(users.id, taskTimeEntries.userId))
      .where(eq(taskTimeEntries.taskId, taskId))
      .orderBy(desc(taskTimeEntries.createdAt));

    const actualEffortMinutes = entries.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
    const baseline = task.baselineEstimateMinutes ?? 0;
    const remaining = task.remainingEstimateMinutes ?? 0;
    const forecastTotalMinutes = actualEffortMinutes + remaining;
    const forecastVarianceMinutes = forecastTotalMinutes - baseline;

    return {
      entries,
      actualEffortMinutes,
      baselineEstimateMinutes: task.baselineEstimateMinutes,
      currentEstimateMinutes: task.currentEstimateMinutes,
      remainingEstimateMinutes: task.remainingEstimateMinutes,
      forecastTotalMinutes,
      forecastVarianceMinutes,
    };
  }

  async reviseEstimate(taskId: string, actor: Actor, input: ReviseEstimateInput) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const canManage = await this.workspaces.isManager(task.workspaceId, actor);
    if (!canManage) throw new ForbiddenException('Only an admin or workspace manager can approve estimate revisions');
    const previous = task.currentEstimateMinutes ?? task.baselineEstimateMinutes ?? 0;
    return this.db.transaction(async (tx) => {
      const [revision] = await tx.insert(taskEstimateRevisions).values({
        taskId, previousEstimateMinutes: previous, revisedEstimateMinutes: input.revisedEstimateMinutes,
        reason: input.reason, classification: input.classification, actorId: actor.id,
      }).returning();
      await tx.update(tasks).set({ currentEstimateMinutes: input.revisedEstimateMinutes, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      await this.audit.record({ workspaceId: task.workspaceId, taskId, userId: actor.id, action: AuditAction.ESTIMATE_CHANGED,
        beforeValue: { currentEstimateMinutes: previous }, afterValue: { currentEstimateMinutes: input.revisedEstimateMinutes, reason: input.reason, classification: input.classification } }, tx);
      if (task.parentTaskId) await this.recalcParentRollup(task.parentTaskId, actor.id, tx);
      return revision;
    });
  }

  async reopen(taskId: string, actor: Actor, input: ReopenTaskInput) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const canManage = task.reviewerId === actor.id || await this.workspaces.isManager(task.workspaceId, actor);
    if (!canManage) throw new ForbiddenException('Only the reviewer or a workspace manager can reopen this task');
    if (task.status !== 'DONE') throw new BadRequestException('Only an accepted task can be reopened');
    return this.db.transaction(async (tx) => {
      const [event] = await tx.insert(taskReopenings).values({ taskId, reason: input.reason, actorId: actor.id }).returning();
      await tx.update(tasks).set({ status: 'IN_PROGRESS', completedAt: null, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      await this.audit.record({ workspaceId: task.workspaceId, taskId, userId: actor.id, action: AuditAction.STATUS_CHANGED,
        beforeValue: { status: 'DONE' }, afterValue: { status: 'IN_PROGRESS', reopeningId: event!.id, reason: input.reason } }, tx);
      return event;
    });
  }

  async allocateTimeEntry(taskId: string, entryId: string, actor: Actor, input: AllocateTimeEntryInput) {
    const [source, target, entry] = await Promise.all([
      this.loadTaskOrThrow(taskId), this.loadTaskOrThrow(input.targetTaskId),
      this.db.select().from(taskTimeEntries).where(and(eq(taskTimeEntries.id, entryId), eq(taskTimeEntries.taskId, taskId))).limit(1).then((r) => r[0]),
    ]);
    await this.workspaces.assertCanAccess(source.workspaceId, actor);
    const canManage = await this.workspaces.isManager(source.workspaceId, actor);
    if (!canManage) throw new ForbiddenException('Only an admin or workspace manager can allocate historical time');
    if (!entry) throw new NotFoundException('Time entry not found');
    if (target.parentTaskId !== source.id || target.workspaceId !== source.workspaceId) throw new BadRequestException('Target must be a direct child of the source task');
    if (entry.endedAt === null) throw new BadRequestException('Stop the timer before allocating it');
    if (input.durationMinutes > entry.durationMinutes) throw new BadRequestException('Allocated minutes exceed the source entry');
    return this.db.transaction(async (tx) => {
      let moved;
      if (input.durationMinutes === entry.durationMinutes) {
        [moved] = await tx.update(taskTimeEntries).set({ taskId: target.id, updatedAt: new Date() }).where(eq(taskTimeEntries.id, entry.id)).returning();
      } else {
        await tx.update(taskTimeEntries).set({ durationMinutes: entry.durationMinutes - input.durationMinutes, updatedAt: new Date() }).where(eq(taskTimeEntries.id, entry.id));
        [moved] = await tx.insert(taskTimeEntries).values({ taskId: target.id, userId: entry.userId, workDate: entry.workDate,
          durationMinutes: input.durationMinutes, category: entry.category, note: entry.note, startedAt: entry.startedAt, endedAt: entry.endedAt }).returning();
      }
      await this.audit.record({ workspaceId: source.workspaceId, taskId: source.id, userId: actor.id, action: AuditAction.TIME_ENTRY_UPDATED,
        beforeValue: { entryId, taskId, durationMinutes: entry.durationMinutes }, afterValue: { targetTaskId: target.id, movedEntryId: moved!.id, allocatedMinutes: input.durationMinutes, reason: input.reason } }, tx);
      return { sourceEntryId: entry.id, movedEntryId: moved!.id, allocatedMinutes: input.durationMinutes, totalMinutesPreserved: true };
    });
  }

  // ── Task Blockers & Dependencies (P01) ────────────────────────────────────

  async addBlocker(taskId: string, actor: Actor, input: { reason: string; unblockerUserId: string; nextFollowUpAt?: string }) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);

    return await this.db.transaction(async (tx) => {
      const [blocker] = await tx
        .insert(taskBlockers)
        .values({
          taskId,
          reason: input.reason,
          unblockerUserId: input.unblockerUserId,
          nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
        })
        .returning();

      await this.audit.record(
        {
          workspaceId: task.workspaceId,
          taskId,
          userId: actor.id,
          action: AuditAction.TASK_BLOCKED,
          afterValue: { blockerId: blocker.id, reason: input.reason, unblockerUserId: input.unblockerUserId },
        },
        tx,
      );

      return blocker;
    });
  }

  /** Every blocker interval for a task, open ones first, with the responsible unblocker resolved to a person. */
  /**
   * Marking a reviewer-less top-level task Done skips evidence and acceptance, so the
   * organisation policy decides whether that is allowed (spec section 5 "documented simplified review policy").
   */
  private async assertSimplifiedDoneAllowed(estimateMinutes: number | null): Promise<void> {
    const [policy] = await this.db.select().from(organisationPolicies).where(eq(organisationPolicies.id, 1));
    const mode = policy?.noReviewerDonePolicy ?? 'ALLOW';
    if (mode === 'ALLOW') return;
    if (mode === 'REQUIRE_REVIEWER') {
      throw new BadRequestException('Assign a reviewer and submit evidence for review; tasks cannot be marked Done without one');
    }
    const max = policy?.simplifiedReviewMaxMinutes ?? 120;
    if (estimateMinutes === null || estimateMinutes > max) {
      throw new BadRequestException(`Only tasks estimated at ${max} minutes or less can be marked Done without a reviewer; assign a reviewer and submit evidence`);
    }
  }

  async listBlockers(taskId: string, actor: Actor) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const rows = await this.db.select().from(taskBlockers).where(eq(taskBlockers.taskId, taskId)).orderBy(desc(taskBlockers.blockedAt));
    const people = await this.userRefs(rows.map((r) => r.unblockerUserId));
    const open = rows.filter((r) => !r.unblockedAt);
    const closed = rows.filter((r) => r.unblockedAt);
    return [...open, ...closed].map((r) => ({
      id: r.id,
      reason: r.reason,
      unblocker: people.get(r.unblockerUserId) ?? null,
      blockedAt: r.blockedAt.toISOString(),
      unblockedAt: r.unblockedAt ? r.unblockedAt.toISOString() : null,
      nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
    }));
  }

  async unblock(blockerId: string, actor: Actor) {
    const [blocker] = await this.db.select().from(taskBlockers).where(eq(taskBlockers.id, blockerId)).limit(1);
    if (!blocker) throw new NotFoundException('Blocker record not found');
    const task = await this.loadTaskOrThrow(blocker.taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);

    const now = new Date();
    const [updated] = await this.db
      .update(taskBlockers)
      .set({ unblockedAt: now })
      .where(eq(taskBlockers.id, blockerId))
      .returning();

    await this.audit.record({
      workspaceId: task.workspaceId,
      taskId: task.id,
      userId: actor.id,
      action: AuditAction.TASK_UNBLOCKED,
      afterValue: { blockerId, unblockedAt: now.toISOString() },
    });

    return updated;
  }

  async addDependency(actor: Actor, input: { predecessorTaskId: string; successorTaskId: string; isBlocking?: boolean }) {
    const pred = await this.loadTaskOrThrow(input.predecessorTaskId);
    const succ = await this.loadTaskOrThrow(input.successorTaskId);
    await this.workspaces.assertCanAccess(pred.workspaceId, actor);
    if (pred.workspaceId !== succ.workspaceId) {
      throw new BadRequestException('Tasks must belong to the same workspace');
    }

    const [dep] = await this.db
      .insert(taskDependencies)
      .values({
        predecessorTaskId: input.predecessorTaskId,
        successorTaskId: input.successorTaskId,
        isBlocking: input.isBlocking ?? true,
      })
      .returning();

    await this.audit.record({
      workspaceId: pred.workspaceId,
      taskId: succ.id,
      userId: actor.id,
      action: AuditAction.DEPENDENCY_ADDED,
      afterValue: { predecessorTaskId: input.predecessorTaskId, successorTaskId: input.successorTaskId },
    });

    return dep;
  }

  /** Predecessors this task waits on, and successors that wait on it — with enough task context to render and link them. */
  async listDependencies(taskId: string, actor: Actor) {
    const task = await this.loadTaskOrThrow(taskId);
    await this.workspaces.assertCanAccess(task.workspaceId, actor);
    const rows = await this.db
      .select()
      .from(taskDependencies)
      .where(or(eq(taskDependencies.predecessorTaskId, taskId), eq(taskDependencies.successorTaskId, taskId)));
    const otherIds = rows.map((r) => (r.predecessorTaskId === taskId ? r.successorTaskId : r.predecessorTaskId));
    const others = otherIds.length
      ? await this.db
          .select({ id: tasks.id, number: tasks.number, title: tasks.title, status: tasks.status, prefix: projects.taskPrefix })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(inArray(tasks.id, otherIds))
      : [];
    const byId = new Map(others.map((o) => [o.id, o]));
    return rows.flatMap((r) => {
      const waitsOn = r.successorTaskId === taskId;
      const other = byId.get(waitsOn ? r.predecessorTaskId : r.successorTaskId);
      if (!other) return [];
      return [{ id: r.id, direction: waitsOn ? ('WAITS_ON' as const) : ('BLOCKS' as const), isBlocking: r.isBlocking, task: { id: other.id, ref: this.ref(other.prefix, other.number), title: other.title, status: other.status } }];
    });
  }

  async removeDependency(dependencyId: string, actor: Actor) {
    const [dep] = await this.db.select().from(taskDependencies).where(eq(taskDependencies.id, dependencyId)).limit(1);
    if (!dep) throw new NotFoundException('Dependency record not found');
    const succ = await this.loadTaskOrThrow(dep.successorTaskId);
    await this.workspaces.assertCanAccess(succ.workspaceId, actor);

    await this.db.delete(taskDependencies).where(eq(taskDependencies.id, dependencyId));

    await this.audit.record({
      workspaceId: succ.workspaceId,
      taskId: succ.id,
      userId: actor.id,
      action: AuditAction.DEPENDENCY_REMOVED,
      beforeValue: { predecessorTaskId: dep.predecessorTaskId, successorTaskId: dep.successorTaskId },
    });

    return { id: dependencyId };
  }

  // ── capacity allocation (P01) ────────────────────────────────────────────

  /**
   * Persists a planned allocation of a person's effort for a period (PRD §7:
   * spread remaining effort across the days/weeks it's actually planned for,
   * and split a task's effort among its contributors rather than double
   * counting the full estimate per tagged person).
   */
  async allocateCapacity(workspaceId: string, actor: Actor, input: CapacityAllocationInput): Promise<typeof capacityAllocations.$inferSelect> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const [isMember] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, input.userId)))
      .limit(1);
    if (!isMember) throw new BadRequestException('The person must be a member of this workspace');
    if (input.taskId) {
      const task = await this.loadTaskOrThrow(input.taskId);
      if (task.workspaceId !== workspaceId) throw new BadRequestException('Task must belong to this workspace');
    }
    const [row] = await this.db
      .insert(capacityAllocations)
      .values({
        workspaceId,
        taskId: input.taskId ?? null,
        userId: input.userId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        allocatedMinutes: input.allocatedMinutes,
      })
      .returning();
    if (!row) throw new Error('Failed to record allocation');
    await this.audit.record({ workspaceId, taskId: input.taskId ?? null, userId: actor.id, action: AuditAction.CAPACITY_ALLOCATED, afterValue: { userId: input.userId, periodStart: input.periodStart, periodEnd: input.periodEnd, allocatedMinutes: input.allocatedMinutes } });
    return row;
  }

  async removeCapacityAllocation(id: string, actor: Actor): Promise<{ id: string }> {
    const [row] = await this.db.select().from(capacityAllocations).where(eq(capacityAllocations.id, id)).limit(1);
    if (!row) throw new NotFoundException('Allocation not found');
    await this.workspaces.assertCanAccess(row.workspaceId, actor);
    await this.db.delete(capacityAllocations).where(eq(capacityAllocations.id, id));
    await this.audit.record({ workspaceId: row.workspaceId, taskId: row.taskId, userId: actor.id, action: AuditAction.CAPACITY_ALLOCATION_REMOVED, beforeValue: { userId: row.userId, periodStart: row.periodStart, periodEnd: row.periodEnd, allocatedMinutes: row.allocatedMinutes } });
    return { id };
  }

  /** Weekly planning view (PRD §7 "expose overload, available capacity, unassigned work"): one row per workspace member with allocations in range. */
  async weeklyCapacity(workspaceId: string, actor: Actor, periodStart: string, periodEnd: string) {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const [members, allocations, calendar] = await Promise.all([
      this.db
        .select({ id: users.id, name: users.name, email: users.email, avatarKey: users.avatarKey })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.isActive, true))),
      this.db
        .select()
        .from(capacityAllocations)
        .where(and(eq(capacityAllocations.workspaceId, workspaceId), lte(capacityAllocations.periodStart, periodEnd), gte(capacityAllocations.periodEnd, periodStart))),
      this.calendar.get(),
    ]);

    const settings = calendar.settings;
    const tz = settings?.timezone ?? 'Asia/Kolkata';
    const periodFrom = localMidnight(periodStart, tz);
    const periodTo = localMidnight(this.nextDay(periodEnd), tz);

    // Scheduled working minutes for the office over the period, before any personal time is taken out.
    const scheduledMinutes = settings
      ? workingMinutesElapsed(periodFrom.toISOString(), periodTo.toISOString(), settings, calendar.exceptions)
      : 0;
    const workingIn = (intervals: Array<{ start: number; end: number }>) =>
      settings
        ? mergeIntervals(intervals).reduce((sum, i) => sum + workingMinutesElapsed(new Date(i.start).toISOString(), new Date(i.end).toISOString(), settings, calendar.exceptions), 0)
        : 0;

    const memberIds = members.map((m) => m.id);
    const [reservations, leaves] = memberIds.length
      ? await Promise.all([
          this.db
            .select()
            .from(reservedTimeBlocks)
            .where(and(inArray(reservedTimeBlocks.userId, memberIds), lt(reservedTimeBlocks.startsAt, periodTo), gt(reservedTimeBlocks.endsAt, periodFrom))),
          this.db
            .select()
            .from(leaveRequests)
            .where(and(inArray(leaveRequests.userId, memberIds), eq(leaveRequests.status, 'APPROVED'), lte(leaveRequests.startDate, periodEnd), gte(leaveRequests.endDate, periodStart))),
        ])
      : [[], []];

    const byUser = new Map<string, number>();
    for (const a of allocations) byUser.set(a.userId, (byUser.get(a.userId) ?? 0) + a.allocatedMinutes);

    const clip = (start: number, end: number) => ({ start: Math.max(start, periodFrom.getTime()), end: Math.min(end, periodTo.getTime()) });
    const halfDayEnd = settings ? (settings.startMinute + (settings.endMinute - settings.startMinute) / 2) * 60000 : 0;

    return members.map((m) => {
      const reserved = reservations.filter((r) => r.userId === m.id).map((r) => clip(r.startsAt.getTime(), r.endsAt.getTime()));
      const leave = leaves
        .filter((l) => l.userId === m.id)
        .map((l) => {
          const from = localMidnight(l.startDate, tz).getTime();
          return clip(from, l.halfDay ? from + halfDayEnd : localMidnight(this.nextDay(l.endDate), tz).getTime());
        });
      const excludedWorking = workingIn([...reserved, ...leave]);
      return {
        user: { id: m.id, name: m.name, email: m.email, avatarKey: m.avatarKey },
        ...calculateCapacity(scheduledMinutes, excludedWorking > 0 ? [{ start: 0, end: excludedWorking }] : [], byUser.get(m.id) ?? 0),
        reservedMinutes: workingIn(reserved),
        leaveMinutes: workingIn(leave),
      };
    });
  }

  private nextDay(date: string): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Open work whose remaining effort nobody has been planned against (PRD §7
   * "unassigned work"): remaining estimate minus everything already allocated
   * to the task. Also surfaces tasks with no assignee at all.
   */
  async unallocatedWork(workspaceId: string, actor: Actor): Promise<UnallocatedWorkItem[]> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const rows = await this.db
      .select({ task: tasks, prefix: projects.taskPrefix })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.isArchived, false), sql`${tasks.status} <> 'DONE'`));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.task.id);
    const [allocs, assignees] = await Promise.all([
      this.db
        .select({ taskId: capacityAllocations.taskId, minutes: sql<number>`coalesce(sum(${capacityAllocations.allocatedMinutes}), 0)::int` })
        .from(capacityAllocations)
        .where(inArray(capacityAllocations.taskId, ids))
        .groupBy(capacityAllocations.taskId),
      this.db
        .select({ taskId: taskAssignees.taskId, n: count() })
        .from(taskAssignees)
        .where(inArray(taskAssignees.taskId, ids))
        .groupBy(taskAssignees.taskId),
    ]);
    const allocated = new Map(allocs.map((a) => [a.taskId!, a.minutes]));
    const assigneeCount = new Map(assignees.map((a) => [a.taskId, Number(a.n)]));
    return rows
      .map((r) => {
        const remaining = r.task.remainingEstimateMinutes ?? 0;
        const done = allocated.get(r.task.id) ?? 0;
        return {
          taskId: r.task.id,
          ref: this.ref(r.prefix, r.task.number),
          title: r.task.title,
          workspaceId,
          remainingMinutes: remaining,
          allocatedMinutes: done,
          unallocatedMinutes: Math.max(0, remaining - done),
          assigneeCount: assigneeCount.get(r.task.id) ?? 0,
          dueDate: r.task.dueDate ? r.task.dueDate.toISOString() : null,
        };
      })
      .filter((x) => x.unallocatedMinutes > 0 || x.assigneeCount === 0)
      .sort((a, b) => b.unallocatedMinutes - a.unallocatedMinutes);
  }

  // ── reserved time (meetings, training …) ─────────────────────────────────

  async addReservedTime(actor: Actor, input: ReservedTimeInput) {
    const userId = input.userId ?? actor.id;
    if (userId !== actor.id && actor.role !== Role.ADMIN) throw new ForbiddenException('You can only reserve time for yourself');
    const [row] = await this.db
      .insert(reservedTimeBlocks)
      .values({ userId, kind: input.kind, title: input.title, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), createdById: actor.id })
      .returning();
    return row!;
  }

  async listReservedTime(actor: Actor, userId?: string, from?: string, to?: string) {
    const target = userId ?? actor.id;
    if (target !== actor.id && actor.role !== Role.ADMIN) throw new ForbiddenException('You can only view your own reserved time');
    const conds = [eq(reservedTimeBlocks.userId, target)];
    if (from) conds.push(gt(reservedTimeBlocks.endsAt, new Date(from)));
    if (to) conds.push(lt(reservedTimeBlocks.startsAt, new Date(to)));
    return this.db.select().from(reservedTimeBlocks).where(and(...conds)).orderBy(asc(reservedTimeBlocks.startsAt));
  }

  async removeReservedTime(id: string, actor: Actor): Promise<{ id: string }> {
    const [row] = await this.db.select().from(reservedTimeBlocks).where(eq(reservedTimeBlocks.id, id)).limit(1);
    if (!row) throw new NotFoundException('Reservation not found');
    if (row.userId !== actor.id && actor.role !== Role.ADMIN) throw new ForbiddenException('You can only remove your own reserved time');
    await this.db.delete(reservedTimeBlocks).where(eq(reservedTimeBlocks.id, id));
    return { id };
  }

  async listCapacityAllocations(workspaceId: string, actor: Actor, userId?: string) {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const conds = [eq(capacityAllocations.workspaceId, workspaceId)];
    if (userId) conds.push(eq(capacityAllocations.userId, userId));
    return this.db.select().from(capacityAllocations).where(and(...conds)).orderBy(asc(capacityAllocations.periodStart));
  }
}

