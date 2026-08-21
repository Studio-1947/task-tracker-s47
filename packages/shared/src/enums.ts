/**
 * Central enums shared across API (Drizzle schema, DTOs) and web.
 * Keep these as the single source of truth — the DB pgEnums are derived from them.
 */

export const Role = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES = Object.values(Role);

/** Default (fixed for MVP) task pipeline — see PRD §3.3 / §8. */
export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  DONE: 'DONE',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
export const TASK_STATUSES = Object.values(TaskStatus);

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];
export const PRIORITIES = Object.values(Priority);

/** Leave request lifecycle. */
export const LeaveStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
} as const;
export type LeaveStatus = (typeof LeaveStatus)[keyof typeof LeaveStatus];
export const LEAVE_STATUSES = Object.values(LeaveStatus);

/** Conversation kinds for the chat layer. DIRECT = 1:1 DM, PROJECT = a project's
 * group channel (membership derived from the workspace), GROUP = ad-hoc named group. */
export const ConversationType = {
  DIRECT: 'DIRECT',
  PROJECT: 'PROJECT',
  GROUP: 'GROUP',
} as const;
export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];
export const CONVERSATION_TYPES = Object.values(ConversationType);

/** An attachment is either an uploaded file or an external link (Figma, Docs, …). */
export const AttachmentKind = {
  FILE: 'FILE',
  LINK: 'LINK',
} as const;
export type AttachmentKind = (typeof AttachmentKind)[keyof typeof AttachmentKind];
export const ATTACHMENT_KINDS = Object.values(AttachmentKind);

/** Audit log actions — PRD §3.5 / §5. */
export const AuditAction = {
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  ASSIGNEE_CHANGED: 'ASSIGNEE_CHANGED',
  PRIORITY_CHANGED: 'PRIORITY_CHANGED',
  DUE_DATE_CHANGED: 'DUE_DATE_CHANGED',
  TITLE_CHANGED: 'TITLE_CHANGED',
  DESCRIPTION_CHANGED: 'DESCRIPTION_CHANGED',
  COMMENTED: 'COMMENTED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED: 'ATTACHMENT_REMOVED',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export const AUDIT_ACTIONS = Object.values(AuditAction);

/* ── Weekly meeting mood board ── */

/** Each working day of the board is split into two halves. */
export const MeetingSlot = {
  FIRST: 'FIRST',
  SECOND: 'SECOND',
} as const;
export type MeetingSlot = (typeof MeetingSlot)[keyof typeof MeetingSlot];
export const MEETING_SLOTS = Object.values(MeetingSlot);

export const MEETING_SLOT_LABELS: Record<MeetingSlot, string> = {
  FIRST: '1st Half',
  SECOND: '2nd Half',
};

/** Lifecycle of a board card. Deliberately lighter than TaskStatus. */
export const BoardItemStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
} as const;
export type BoardItemStatus = (typeof BoardItemStatus)[keyof typeof BoardItemStatus];
export const BOARD_ITEM_STATUSES = Object.values(BoardItemStatus);

export const BOARD_ITEM_STATUS_LABELS: Record<BoardItemStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

/** A member's self-reported mood for the week — one check-in per member per board. */
export const MoodLevel = {
  GREAT: 'GREAT',
  GOOD: 'GOOD',
  OKAY: 'OKAY',
  LOW: 'LOW',
  BLOCKED: 'BLOCKED',
} as const;
export type MoodLevel = (typeof MoodLevel)[keyof typeof MoodLevel];
export const MOOD_LEVELS = Object.values(MoodLevel);

export const MOOD_META: Record<MoodLevel, { label: string; emoji: string; color: string }> = {
  GREAT: { label: 'Great', emoji: '😄', color: '#10b981' },
  GOOD: { label: 'Good', emoji: '🙂', color: '#22c55e' },
  OKAY: { label: 'Okay', emoji: '😐', color: '#f59e0b' },
  LOW: { label: 'Low', emoji: '😕', color: '#f97316' },
  BLOCKED: { label: 'Blocked', emoji: '😣', color: '#ef4444' },
};
export const NotificationType = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_COMMENT: 'TASK_COMMENT',
  TASK_DUE_SOON: 'TASK_DUE_SOON',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
export const NOTIFICATION_TYPES = Object.values(NotificationType);
