import { z } from 'zod';
import { PRIORITIES, Priority, TASK_STATUSES, TaskStatus } from '../enums';

const statusEnum = z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]]);
const priorityEnum = z.enum(PRIORITIES as [Priority, ...Priority[]]);

export const createTaskSchema = z.object({
  /** Project the task belongs to (must be a project of the target workspace). */
  projectId: z.string().uuid(),
  title: z.string().min(1).max(1000),
  description: z.string().max(20000).optional(),
  acceptanceCriteria: z.string().trim().min(1).max(10000).optional(),
  childScope: z.enum(['REQUIRED', 'OPTIONAL', 'CANCELLED']).optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  /** ISO datetime string, or null for no due date. */
  dueDate: z.string().datetime().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  baselineEstimateMinutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
  currentEstimateMinutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
  remainingEstimateMinutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  /** Set to create this task as a subtask of another (must be a top-level task in the same project). */
  parentTaskId: z.string().uuid().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Lightweight create form used by the "+ Add subtask" quick-add under a task. */
export const createSubtaskSchema = z.object({
  title: z.string().min(1).max(1000),
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
    title: z.string().min(1).max(1000).optional(),
    description: z.string().max(20000).nullable().optional(),
    acceptanceCriteria: z.string().trim().min(1).max(10000).nullable().optional(),
    childScope: z.enum(['REQUIRED', 'OPTIONAL', 'CANCELLED']).optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    /** Required when an existing commitment date is moved or cleared (PRD §2); stored in the audit trail. */
    dueDateReason: z.string().trim().min(1).max(2000).optional(),
    assigneeIds: z.array(z.string().uuid()).optional(),
    ownerId: z.string().uuid().nullable().optional(),
    reviewerId: z.string().uuid().nullable().optional(),
    currentEstimateMinutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
    remainingEstimateMinutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
    labelIds: z.array(z.string().uuid()).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const submitTaskSchema = z.object({
  evidenceAttachmentId: z.string().uuid(),
  note: z.string().trim().min(1).max(4000),
});
export type SubmitTaskInput = z.infer<typeof submitTaskSchema>;

export const reviewTaskSchema = z
  .object({
    decision: z.enum(['ACCEPTED', 'RETURNED']),
    note: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.decision !== 'RETURNED' || !!v.note, { message: 'A return reason is required', path: ['note'] });
export type ReviewTaskInput = z.infer<typeof reviewTaskSchema>;

export const createCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/**
 * Attach an external link (e.g. a Figma file) instead of uploading bytes.
 * Only http(s) is accepted — `javascript:`, `data:` and friends are rejected here
 * so they can never reach an href or an iframe src.
 */
export const createLinkAttachmentSchema = z.object({
  url: z
    .string()
    .url()
    .max(2000)
    .refine((v) => {
      try {
        const scheme = new URL(v).protocol;
        return scheme === 'http:' || scheme === 'https:';
      } catch {
        return false;
      }
    }, { message: 'Link must be an http(s) URL' }),
  /** Display label. Falls back to the link's hostname when omitted. */
  title: z.string().min(1).max(255).optional(),
});
export type CreateLinkAttachmentInput = z.infer<typeof createLinkAttachmentSchema>;

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
  /** Planning-hygiene filters (spec section 11): the exceptions a manager should chase. */
  attention: z.enum(['NO_OWNER', 'NO_DEADLINE', 'BLOCKED', 'REVIEW_OVERDUE', 'MISSING_ESTIMATE', 'OVERDUE']).optional(),
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

export const logTimeEntrySchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(1).max(1440),
  /** When the work began. Without it the entry is a plain duration on `workDate`; with it the entry is a real interval, overlap-checked and split at office-local midnight. */
  startedAt: z.string().datetime().optional(),
  category: z.enum(['EXECUTION', 'REVIEW', 'REWORK']).default('EXECUTION'),
  note: z.string().max(2000).optional(),
});
export type LogTimeEntryInput = z.infer<typeof logTimeEntrySchema>;

export const startTimerSchema = z.object({
  category: z.enum(['EXECUTION', 'REVIEW', 'REWORK']).default('EXECUTION'),
  note: z.string().max(2000).optional(),
});
export type StartTimerInput = z.infer<typeof startTimerSchema>;

export const reviseEstimateSchema = z.object({
  revisedEstimateMinutes: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(1).max(2000),
  classification: z.enum(['SCOPE_CHANGE', 'PLANNING_CORRECTION', 'CLIENT_CHANGE', 'INTERNAL_CHANGE']),
});
export type ReviseEstimateInput = z.infer<typeof reviseEstimateSchema>;

export const reopenTaskSchema = z.object({ reason: z.string().trim().min(1).max(2000) });
export type ReopenTaskInput = z.infer<typeof reopenTaskSchema>;

export const allocateTimeEntrySchema = z.object({
  targetTaskId: z.string().uuid(),
  durationMinutes: z.number().int().min(1).max(1440),
  reason: z.string().trim().min(1).max(2000),
});
export type AllocateTimeEntryInput = z.infer<typeof allocateTimeEntrySchema>;

export const createBlockerSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  unblockerUserId: z.string().uuid(),
  nextFollowUpAt: z.string().datetime().optional(),
});
export type CreateBlockerInput = z.infer<typeof createBlockerSchema>;

export const createDependencySchema = z.object({
  predecessorTaskId: z.string().uuid(),
  successorTaskId: z.string().uuid(),
  isBlocking: z.boolean().default(true),
});
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;

/**
 * Delegates review authority for one task to another person for a bounded,
 * effective-dated period (PRD §9 "Reviewer delegate": only the explicitly
 * delegated scope, for its effective period — no automatic wider access).
 */
export const delegateReviewSchema = z.object({
  delegateId: z.string().uuid(),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime(),
  reason: z.string().trim().min(1).max(2000),
}).refine((v) => v.effectiveTo > v.effectiveFrom, { message: 'Effective end must be after the start', path: ['effectiveTo'] });
export type DelegateReviewInput = z.infer<typeof delegateReviewSchema>;


export type TaskSizeLabel = 'SMALL' | 'SHORT' | 'BIG' | 'HUGE' | 'LARGER';
export const TASK_SIZE_LABELS: Record<TaskSizeLabel, string> = {
  SMALL: 'Small action',
  SHORT: 'Short',
  BIG: 'Big',
  HUGE: 'Huge',
  LARGER: 'Larger work',
};

/** PRD §4: size is derived from estimated minutes, never stored; priority is independent. */
export function taskSizeLabel(minutes: number | null | undefined): TaskSizeLabel | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 10) return 'SMALL';
  if (minutes <= 30) return 'SHORT';
  if (minutes <= 60) return 'BIG';
  if (minutes <= 120) return 'HUGE';
  return 'LARGER';
}
