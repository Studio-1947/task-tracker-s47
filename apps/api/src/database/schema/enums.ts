import { pgEnum } from 'drizzle-orm/pg-core';
import {
  PRIORITIES,
  ROLES,
  TASK_STATUSES,
  ATTACHMENT_KINDS,
  AUDIT_ACTIONS,
  LEAVE_STATUSES,
  CONVERSATION_TYPES,
  MEETING_SLOTS,
  BOARD_ITEM_STATUSES,
  MOOD_LEVELS,
  NOTIFICATION_TYPES,
  TASK_SIZES,
} from '@task-tracker/shared';

// Postgres enums derived from the shared TS enums (single source of truth).
export const roleEnum = pgEnum('role', ROLES as [string, ...string[]]);
export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES as [string, ...string[]]);
export const priorityEnum = pgEnum('priority', PRIORITIES as [string, ...string[]]);
export const taskSizeEnum = pgEnum('task_size', TASK_SIZES as [string, ...string[]]);
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS as [string, ...string[]]);
export const leaveStatusEnum = pgEnum('leave_status', LEAVE_STATUSES as [string, ...string[]]);
export const conversationTypeEnum = pgEnum('conversation_type', CONVERSATION_TYPES as [string, ...string[]]);
export const attachmentKindEnum = pgEnum('attachment_kind', ATTACHMENT_KINDS as [string, ...string[]]);
export const meetingSlotEnum = pgEnum('meeting_slot', MEETING_SLOTS as [string, ...string[]]);
export const boardItemStatusEnum = pgEnum('board_item_status', BOARD_ITEM_STATUSES as [string, ...string[]]);
export const moodLevelEnum = pgEnum('mood_level', MOOD_LEVELS as [string, ...string[]]);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES as [string, ...string[]]);
