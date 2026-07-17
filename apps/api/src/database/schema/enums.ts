import { pgEnum } from 'drizzle-orm/pg-core';
import {
  PRIORITIES,
  ROLES,
  TASK_STATUSES,
  AUDIT_ACTIONS,
  LEAVE_STATUSES,
  CONVERSATION_TYPES,
} from '@task-tracker/shared';

// Postgres enums derived from the shared TS enums (single source of truth).
export const roleEnum = pgEnum('role', ROLES as [string, ...string[]]);
export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES as [string, ...string[]]);
export const priorityEnum = pgEnum('priority', PRIORITIES as [string, ...string[]]);
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS as [string, ...string[]]);
export const leaveStatusEnum = pgEnum('leave_status', LEAVE_STATUSES as [string, ...string[]]);
export const conversationTypeEnum = pgEnum('conversation_type', CONVERSATION_TYPES as [string, ...string[]]);
