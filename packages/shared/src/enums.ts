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

/**
 * Per-workspace role (PRD §9 "Team manager"): scoped to the workspaces the
 * person is actually assigned to, unlike the global `Role` above. A MANAGER
 * gets elevated review authority within that workspace only — no automatic
 * cross-workspace admin or payroll access.
 */
export const WorkspaceRole = {
  MEMBER: 'MEMBER',
  MANAGER: 'MANAGER',
} as const;
export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];
export const WORKSPACE_ROLES = Object.values(WorkspaceRole);

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
  OWNER_CHANGED: 'OWNER_CHANGED',
  REVIEWER_CHANGED: 'REVIEWER_CHANGED',
  ESTIMATE_CHANGED: 'ESTIMATE_CHANGED',
  SUBMITTED: 'SUBMITTED',
  REVIEWED: 'REVIEWED',
  COMMENTED: 'COMMENTED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED: 'ATTACHMENT_REMOVED',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
  WORKSPACE_ROLE_CHANGED: 'WORKSPACE_ROLE_CHANGED',
  TIME_ENTRY_CREATED: 'TIME_ENTRY_CREATED',
  TIME_ENTRY_UPDATED: 'TIME_ENTRY_UPDATED',
  ATTENDANCE_CORRECTION_REQUESTED: 'ATTENDANCE_CORRECTION_REQUESTED',
  ATTENDANCE_CORRECTION_DECIDED: 'ATTENDANCE_CORRECTION_DECIDED',
  TASK_BLOCKED: 'TASK_BLOCKED',
  TASK_UNBLOCKED: 'TASK_UNBLOCKED',
  DEPENDENCY_ADDED: 'DEPENDENCY_ADDED',
  DEPENDENCY_REMOVED: 'DEPENDENCY_REMOVED',
  REVIEW_DELEGATED: 'REVIEW_DELEGATED',
  CAPACITY_ALLOCATED: 'CAPACITY_ALLOCATED',
  CAPACITY_ALLOCATION_REMOVED: 'CAPACITY_ALLOCATION_REMOVED',
  SCHEDULE_GROUP_ASSIGNED: 'SCHEDULE_GROUP_ASSIGNED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export const AUDIT_ACTIONS = Object.values(AuditAction);

export const TimeCategory = {
  EXECUTION: 'EXECUTION',
  REVIEW: 'REVIEW',
  REWORK: 'REWORK',
} as const;
export type TimeCategory = (typeof TimeCategory)[keyof typeof TimeCategory];
export const TIME_CATEGORIES = Object.values(TimeCategory);

export const CorrectionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type CorrectionStatus = (typeof CorrectionStatus)[keyof typeof CorrectionStatus];
export const CORRECTION_STATUSES = Object.values(CorrectionStatus);

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
  REVIEW_OVERDUE: 'REVIEW_OVERDUE',
  BLOCKER_FOLLOW_UP: 'BLOCKER_FOLLOW_UP',
  UPDATE_OVERDUE: 'UPDATE_OVERDUE',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
export const NOTIFICATION_TYPES = Object.values(NotificationType);

/* ── Meeting board ↔ workspace task mirroring ── */

/**
 * A board card filed under a project is mirrored by a real workspace task. The
 * board's three-step pipeline is coarser than the task's four, so the mapping is
 * lossy one way on purpose: IN_REVIEW folds back into IN_PROGRESS, and pushing
 * that board status forward again leaves the task in IN_REVIEW untouched.
 */
export const BOARD_STATUS_TO_TASK_STATUS: Record<BoardItemStatus, TaskStatus> = {
  PENDING: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
};

export const TASK_STATUS_TO_BOARD_STATUS: Record<TaskStatus, BoardItemStatus> = {
  TODO: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_PROGRESS',
  DONE: 'DONE',
};

/* ── Account lifecycle ── */

/**
 * The three states an account can be in. Only ACTIVE is stored as a flag;
 * DEACTIVATED and REMOVED are both `isActive: false` and are told apart by
 * `removedAt`, so that a suspension and an offboarding never look alike.
 */
export const UserStatus = {
  /** Can sign in and work. */
  ACTIVE: 'ACTIVE',
  /** Suspended: locked out, but workspaces and task assignments are untouched. */
  DEACTIVATED: 'DEACTIVATED',
  /** Offboarded: locked out and already stripped of workspaces and assignments. */
  REMOVED: 'REMOVED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const USER_STATUSES = Object.values(UserStatus);

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
  REMOVED: 'Removed',
};

/** Derives the account state. Keep API and web reading it the same way. */
export function userStatus(user: { isActive: boolean; removedAt?: string | null }): UserStatus {
  if (user.isActive) return UserStatus.ACTIVE;
  return user.removedAt ? UserStatus.REMOVED : UserStatus.DEACTIVATED;
}
