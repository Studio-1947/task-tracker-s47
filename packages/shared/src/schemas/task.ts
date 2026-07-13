import { z } from 'zod';
import { PRIORITIES, Priority, TASK_STATUSES, TaskStatus } from '../enums';

const statusEnum = z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]]);
const priorityEnum = z.enum(PRIORITIES as [Priority, ...Priority[]]);

export const createTaskSchema = z.object({
  /** Project the task belongs to (must be a project of the target workspace). */
  projectId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  /** ISO datetime string, or null for no due date. */
  dueDate: z.string().datetime().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  /** Set to create this task as a subtask of another (must be a top-level task in the same project). */
  parentTaskId: z.string().uuid().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Lightweight create form used by the "+ Add subtask" quick-add under a task. */
export const createSubtaskSchema = z.object({
  title: z.string().min(1).max(300),
  assigneeIds: z.array(z.string().uuid()).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;

/**
 * Partial update. Semantics: a field omitted is left unchanged; `dueDate: null`
 * clears the due date; `assigneeIds` (when present) replaces the whole set.
 */
export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(20000).nullable().optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    assigneeIds: z.array(z.string().uuid()).optional(),
    labelIds: z.array(z.string().uuid()).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const createCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/** Query params for the shared task list (Kanban/List/Table all read this). */
export const taskQuerySchema = z.object({
  status: statusEnum.optional(),
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
  priority: priorityEnum.optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'status', 'number']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});
export type TaskQuery = z.infer<typeof taskQuerySchema>;
