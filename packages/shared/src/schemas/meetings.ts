import { z } from 'zod';
import {
  BOARD_ITEM_STATUSES,
  MEETING_SLOTS,
  MOOD_LEVELS,
  type BoardItemStatus,
  type MeetingSlot,
  type MoodLevel,
  TASK_SIZES,
  type TaskSize,
} from '../enums';

const slotEnum = z.enum(MEETING_SLOTS as [MeetingSlot, ...MeetingSlot[]]);
const itemStatusEnum = z.enum(BOARD_ITEM_STATUSES as [BoardItemStatus, ...BoardItemStatus[]]);
const moodEnum = z.enum(MOOD_LEVELS as [MoodLevel, ...MoodLevel[]]);

/** A board is keyed by the Monday of its week; the server normalises anything else. */
export const weekStartSchema = z.string().date();

/* ── Board (admin) ── */
export const updateMeetingBoardSchema = z
  .object({
    title: z.string().max(120).nullable().optional(),
    agenda: z.string().max(5000).nullable().optional(),
    /** Locked boards are read-only for members; admins can still edit. */
    isLocked: z.boolean().optional(),
  })
  .strict();
export type UpdateMeetingBoardInput = z.infer<typeof updateMeetingBoardSchema>;

/* ── Cards ── */
export const createBoardItemSchema = z
  .object({
    /** Owner of the card. Omit for yourself; only admins may set another member. */
    userId: z.string().uuid().optional(),
    /** People tagged on the mirrored workspace task. */
    assigneeIds: z.array(z.string().uuid()).max(50).optional(),
    dayDate: z.string().date(),
    slot: slotEnum,
    title: z.string().min(1).max(1000),
    note: z.string().max(2000).nullable().optional(),
    status: itemStatusEnum.optional(),
    /**
     * File the card under a project. Doing so mirrors it as a real task in that
     * project's workspace, so meeting work shows up alongside everything else.
     */
    projectId: z.string().uuid().nullable().optional(),
    /** Required by the weekly-task UI when a card is mirrored into a task. */
    dueDate: z.string().datetime().optional(),
    size: z.enum(TASK_SIZES as [TaskSize, ...TaskSize[]]).optional(),
  })
  .strict();
export type CreateBoardItemInput = z.infer<typeof createBoardItemSchema>;

export const updateBoardItemSchema = z
  .object({
    userId: z.string().uuid().optional(),
    /** Replaces the people tagged on the mirrored workspace task. */
    assigneeIds: z.array(z.string().uuid()).max(50).optional(),
    dayDate: z.string().date().optional(),
    slot: slotEnum.optional(),
    title: z.string().min(1).max(1000).optional(),
    note: z.string().max(2000).nullable().optional(),
    status: itemStatusEnum.optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    /** Re-file the card. `null` detaches it; the mirror task is left in place. */
    projectId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type UpdateBoardItemInput = z.infer<typeof updateBoardItemSchema>;

/** Bulk placement update emitted after a drag-and-drop. */
export const reorderBoardItemsSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          dayDate: z.string().date(),
          slot: slotEnum,
          position: z.number().int().min(0).max(10_000),
        }),
      )
      .min(1)
      .max(200),
  })
  .strict();
export type ReorderBoardItemsInput = z.infer<typeof reorderBoardItemsSchema>;

/* ── Mood check-in ── */
export const setMoodSchema = z
  .object({
    mood: moodEnum,
    note: z.string().max(500).nullable().optional(),
  })
  .strict();
export type SetMoodInput = z.infer<typeof setMoodSchema>;

/* ── Notes & comments ── */
export const createBoardNoteSchema = z
  .object({
    /** Omit for a board-level meeting note; set to comment on one card. */
    itemId: z.string().uuid().nullable().optional(),
    body: z.string().min(1).max(4000),
    mentionIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();
export type CreateBoardNoteInput = z.infer<typeof createBoardNoteSchema>;

export const updateBoardNoteSchema = z
  .object({
    body: z.string().min(1).max(4000),
  })
  .strict();
export type UpdateBoardNoteInput = z.infer<typeof updateBoardNoteSchema>;
