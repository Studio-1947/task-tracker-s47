import type {
  AttachmentKind,
  AuditAction,
  BoardItemStatus,
  ConversationType,
  LeaveStatus,
  MeetingSlot,
  MoodLevel,
  Priority,
  Role,
  TaskStatus,
  NotificationType,
} from './enums';

/** Shape of the authenticated user echoed by the API (never includes passwordHash). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Storage key of the profile picture (e.g. "avatars/<uuid>.png"), null when unset. */
  avatarKey: string | null;
  /** Job title shown under the name (e.g. "Executive Director"). */
  designation: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** JWT access-token payload. */
export interface JwtPayload {
  sub: string;
  role: Role;
  tokenVersion: number;
  sessionId?: string;
}

/** Standard error envelope returned by the API (PRD §11.5). */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  /** field -> messages, present for validation failures */
  details?: Record<string, string[]>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A project a person is actually working in — derived from the tasks assigned to
 * them, not from workspace membership. Membership grants access to every project
 * in the workspace, which says nothing about where the person's work sits.
 */
export interface UserProjectTag {
  id: string;
  name: string;
  color: string | null;
  workspaceId: string;
  workspaceName: string;
  /** Open (non-archived) tasks assigned to this person in the project. */
  taskCount: number;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarKey: string | null;
  designation: string | null;
  isActive: boolean;
  /**
   * When the person was removed rather than merely deactivated. Both states are
   * `isActive: false`; this is what separates an offboarding from a suspension.
   * Read it through `userStatus()` rather than testing it directly.
   */
  removedAt: string | null;
  createdAt: string;
  workspaceCount?: number;
  /** Projects the person has assigned work in, busiest first. Omitted on writes. */
  projects?: UserProjectTag[];
}

/**
 * Outcome of removing a person. `deleted` is false when the row had to be kept
 * because other records still point at it — they are fully offboarded either way.
 */
export interface RemovedUser {
  id: string;
  deleted: boolean;
}

/** Returned once on user creation when onboarding via temp password (PRD §11.1). */
export interface CreatedUserWithTempPassword extends UserSummary {
  tempPassword: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  /** Secondary tagline shown under the name on the card. */
  subtitle: string | null;
  description: string | null;
  color: string | null;
  /** Storage key of the small square logo, e.g. "avatars/<uuid>.png"; served via /api/files. */
  logoKey: string | null;
  isArchived: boolean;
  createdAt: string;
  memberCount?: number;
  projectCount?: number;
}

/** A project groups tasks inside a workspace and owns its task-ref prefix. */
export interface ProjectSummary {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string | null;
  taskPrefix: string;
  isArchived: boolean;
  createdAt: string;
  taskCount?: number;
}

export interface UserRef {
  id: string;
  name: string;
  email: string;
  avatarKey: string | null;
}

export interface LabelRef {
  id: string;
  name: string;
  color: string | null;
}

/** Row shape for List / Table / Kanban — all three render from this. */
export interface TaskListItem {
  id: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  number: number;
  /** Human-readable reference, e.g. "WEB-12" (project prefix + number). */
  ref: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  /** First committed due date; retained when the current due date is revised. */
  originalDueDate: string | null;
  /**
   * Scheduled working minutes elapsed since `dueDate`, honouring the office
   * calendar (PRD §2) — never moves the due date itself, just ages it against
   * working hours. `null` when there's no due date, it hasn't passed, or the
   * task is already accepted (DONE).
   */
  overdueWorkingMinutes: number | null;
  owner: UserRef | null;
  reviewer: UserRef | null;
  baselineEstimateMinutes: number | null;
  currentEstimateMinutes: number | null;
  remainingEstimateMinutes: number | null;
  assignees: UserRef[];
  labels: LabelRef[];
  commentCount: number;
  attachmentCount: number;
  /** Non-null when this task is a subtask of another. */
  parentTaskId: string | null;
  subtaskCount: number;
  subtaskDoneCount: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Compact row for a task's subtask list / a parent-task reference. */
export interface SubtaskRef {
  id: string;
  ref: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  assignees: UserRef[];
  dueDate: string | null;
}

export interface TaskDetail extends TaskListItem {
  description: string | null;
  createdBy: UserRef;
  parentTask: SubtaskRef | null;
  subtasks: SubtaskRef[];
}

export interface TaskComment {
  id: string;
  body: string;
  user: UserRef;
  createdAt: string;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  note: string;
  status: 'PENDING' | 'ACCEPTED' | 'RETURNED';
  evidenceAttachmentId: string;
  submitter: UserRef;
  reviewer: UserRef | null;
  reviewNote: string | null;
  submittedAt: string;
  decidedAt: string | null;
}

interface AttachmentBase {
  id: string;
  /** Uploaded file: the original filename. Link: the display title. */
  fileName: string;
  uploader: UserRef;
  createdAt: string;
}

/** An uploaded file living under UPLOAD_DIR. */
export interface FileAttachment extends AttachmentBase {
  kind: typeof AttachmentKind.FILE;
  mimeType: string;
  sizeBytes: number;
  /** Server storage key; fetch bytes from /api/files/<storageKey>. */
  storageKey: string;
  url: null;
}

/** An external link (Figma, Google Docs, …). Previewed client-side; never fetched by the API. */
export interface LinkAttachment extends AttachmentBase {
  kind: typeof AttachmentKind.LINK;
  /** Always http(s) — other schemes are rejected at the edge. */
  url: string;
  mimeType: null;
  sizeBytes: null;
  storageKey: null;
}

export type TaskAttachment = FileAttachment | LinkAttachment;

/** Compact task row for the member "my tasks" home. */
export interface MyTaskItem {
  id: string;
  ref: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  workspaceId: string;
  workspaceName: string;
}

export type StatusCounts = Record<TaskStatus, number>;

/** One day of the Mon–Sun completion line chart. */
export interface WeeklyCompletionPoint {
  /** ISO date (yyyy-mm-dd) of the day, UTC. */
  date: string;
  /** Short weekday label, "Mon".."Sun". */
  day: string;
  completed: number;
}

/** Open (not DONE, not archived) tasks currently assigned to a user. */
export interface WorkloadEntry {
  user: UserRef;
  openTasks: number;
}

/** Per-workspace ("office") rollup for the admin performance table. */
export interface WorkspacePerformance {
  id: string;
  name: string;
  color: string | null;
  totalTasks: number;
  completedTasks: number;
  /** 0–100, rounded. */
  completionPct: number;
  /** Any audit activity in the last 7 days. */
  isActive: boolean;
}

export interface UpcomingDeadline {
  id: string;
  ref: string;
  title: string;
  dueDate: string;
  workspaceId: string;
  workspaceName: string;
  /** Whole days until due; 0 = due today. */
  dueInDays: number;
}

/** Row behind the "Overdue tasks" headline count (PRD §10/§12: cards must open the exact records behind their number). */
export interface OverdueTaskRow {
  id: string;
  ref: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  workspaceId: string;
  workspaceName: string;
  /** Working minutes overdue (PRD §2), alongside the raw due date. */
  overdueWorkingMinutes: number | null;
}

export interface AdminDashboard {
  totalWorkspaces: number;
  totalUsers: number;
  tasksByStatus: StatusCounts;
  /**
   * Both this count and `overdueTaskList` come from one query (a window
   * `count(*) over()` alongside the page of rows) so they can never disagree
   * — the exact "13 overdue in headline and 0 in at-risk panel" class of bug
   * the source spec flagged is structurally impossible here.
   */
  overdueTasks: number;
  /** First page of the records behind `overdueTasks`, oldest deadline first. */
  overdueTaskList: OverdueTaskRow[];
  mostActiveWorkspace: { id: string; name: string; activityCount: number } | null;
  recentActivity: AuditEntry[];
  weeklyCompletion: WeeklyCompletionPoint[];
  teamWorkload: WorkloadEntry[];
  workspacePerformance: WorkspacePerformance[];
  upcomingDeadlines: UpcomingDeadline[];
}

export interface MemberDashboard {
  myTasks: MyTaskItem[];
  myWorkspaceCount: number;
  myWorkspaceTaskCount: number;
  tasksByStatus: StatusCounts;
  recentActivity: AuditEntry[];
}

/** Grouped results of the global header search. */
export interface SearchResults {
  tasks: {
    id: string;
    ref: string;
    title: string;
    status: TaskStatus;
    workspaceId: string;
    workspaceName: string;
  }[];
  workspaces: { id: string; name: string; color: string | null }[];
  projects: {
    id: string;
    name: string;
    color: string | null;
    taskPrefix: string;
    workspaceId: string;
    workspaceName: string;
  }[];
  /** Admin-only; null when the requester is not an admin. */
  users: UserSummary[] | null;
}

/** One audit/history entry as returned to the client. */
export interface AuditEntry {
  id: string;
  action: AuditAction;
  taskId: string | null;
  taskRef: string | null;
  user: UserRef;
  beforeValue: unknown;
  afterValue: unknown;
  createdAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarKey: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
}

/* ── Attendance & leave ── */

export interface LeaveType {
  id: string;
  name: string;
  color: string | null;
  defaultBalance: number;
  isActive: boolean;
}

/** A user's balance for one leave type. `allotted` = per-user override or the type default. */
export interface LeaveBalance {
  leaveTypeId: string;
  typeName: string;
  color: string | null;
  allotted: number;
  used: number;
  remaining: number;
}

export interface LeaveRequestItem {
  id: string;
  user: UserRef;
  leaveTypeId: string;
  typeName: string;
  color: string | null;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  reviewedBy: UserRef | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

/** A single lat/lng punch location. */
export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface AttendanceRecordItem {
  id: string;
  workDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  checkInLocation: GeoPoint | null;
  checkOutLocation: GeoPoint | null;
}

/** Admin team-log row: an attendance record plus the member it belongs to. */
export interface AttendanceWithUser extends AttendanceRecordItem {
  user: UserRef;
}

/** Today's punch state for the check-in/out button. */
export interface AttendanceToday {
  workDate: string;
  checkedIn: boolean;
  checkedOut: boolean;
  record: AttendanceRecordItem | null;
}

/* ── Chat ── */

/** A person you can start a DM with (org-wide directory). */
export interface ChatContact {
  id: string;
  name: string;
  email: string;
  avatarKey: string | null;
  designation: string | null;
}

export interface ChatAttachment {
  id: string;
  /** Server storage key, e.g. "attachments/<uuid>.png"; fetch bytes from /api/chat/<storageKey>. */
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: UserRef;
  /** Null when the message is attachment-only or has been soft-deleted. */
  body: string | null;
  attachments: ChatAttachment[];
  /** Ids of users @mentioned in this message. */
  mentionIds: string[];
  parentMessageId: string | null;
  parentMessage: { body: string | null; senderName: string } | null;
  reactions: { emoji: string; userIds: string[] }[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface ConversationMember {
  user: UserRef;
  isAdmin: boolean;
  lastReadAt: string | null;
}

/** Compact preview of the most recent message, for the conversation list. */
export interface ConversationPreview {
  body: string | null;
  senderId: string;
  senderName: string;
  hasAttachment: boolean;
  createdAt: string;
}

/** One row in the conversation list. Title/otherUser are resolved server-side per type. */
export interface ConversationSummary {
  id: string;
  type: ConversationType;
  /** Group title, project name, or the other person's name (DIRECT) — always display-ready. */
  title: string;
  /** For PROJECT conversations. */
  projectId: string | null;
  workspaceId: string | null;
  /** The counterpart in a DIRECT conversation; null for groups/projects. */
  otherUser: UserRef | null;
  memberCount: number;
  lastMessage: ConversationPreview | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ConversationDetail extends ConversationSummary {
  members: ConversationMember[];
}

/* Socket event payloads (server → client) */
export interface MessageEvent {
  conversationId: string;
  message: ChatMessage;
}
export interface MessageDeletedEvent {
  conversationId: string;
  messageId: string;
}
export interface TypingEvent {
  conversationId: string;
  userId: string;
  userName: string;
  typing: boolean;
}
export interface ReadEvent {
  conversationId: string;
  userId: string;
  lastReadAt: string;
}
export interface PresenceEvent {
  userId: string;
  online: boolean;
}
export interface ConversationCreatedEvent {
  conversation: ConversationSummary;
}

/* ── Weekly meeting mood board ── */

/** The project a card is filed under, plus the workspace its mirror task lives in. */
export interface BoardProjectRef {
  id: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  color: string | null;
  taskPrefix: string;
}

/** One card placed in a day/half cell of the week board. */
export interface BoardItem {
  id: string;
  boardId: string;
  user: UserRef;
  /** People tagged on the mirrored workspace task. Empty until the card is filed. */
  assignees: UserRef[];
  /** YYYY-MM-DD — always a working day inside the board's week. */
  dayDate: string;
  slot: MeetingSlot;
  title: string;
  note: string | null;
  status: BoardItemStatus;
  position: number;
  /** Project the card is filed under, or null for unfiled work. */
  project: BoardProjectRef | null;
  /** The mirrored workspace task, created the moment the card gets a project. */
  taskId: string | null;
  /** Human-readable ref of the mirror task, e.g. "WEB-12". */
  taskRef: string | null;
  /**
   * Only set on the read-only clones in `MeetingBoardDetail.carryOver`: the day
   * the work was originally planned for. Always null on a stored card.
   */
  carriedFrom: string | null;
  /** True when the card was rolled onto this board from the previous week, still unfinished. */
  rolledOver: boolean;
  /** Number of comments on this card (bodies are fetched on demand). */
  commentCount: number;
  createdBy: UserRef | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A board-level meeting note, or a comment on a card when `itemId` is set. */
export interface BoardNote {
  id: string;
  boardId: string;
  itemId: string | null;
  author: UserRef;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardMood {
  user: UserRef;
  mood: MoodLevel;
  note: string | null;
  updatedAt: string;
}

/** Completion roll-up. `percent` counts DONE only; `inProgress` is shown as a lighter bar segment. */
export interface BoardProgress {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  percent: number;
}

/** One project's slice of the week. The `project: null` row collects unfiled cards. */
export interface BoardProjectSummary {
  project: BoardProjectRef | null;
  progress: BoardProgress;
  /** How many people have a card under this project this week. */
  memberCount: number;
}

/** One member's row on the board: their cards' roll-up plus this week's mood. */
export interface BoardMemberSummary {
  user: UserRef;
  mood: BoardMood | null;
  progress: BoardProgress;
  /** Per-half breakdown, so admins can see whether the week front- or back-loaded. */
  firstHalf: BoardProgress;
  secondHalf: BoardProgress;
}

/** The whole week in one payload — the board page renders entirely from this. */
export interface MeetingBoardDetail {
  id: string;
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  /** Friday of the week, YYYY-MM-DD. */
  weekEnd: string;
  /** The five working days Mon–Fri, in order. */
  days: string[];
  title: string | null;
  agenda: string | null;
  isLocked: boolean;
  items: BoardItem[];
  /**
   * Read-only clones of still-open cards, repeated on every later working day up
   * to today so unfinished work follows the team forward. They share the stored
   * card's `id` — render them keyed by `id + dayDate` — and are deliberately kept
   * out of `items` so no roll-up counts the same work twice.
   */
  carryOver: BoardItem[];
  notes: BoardNote[];
  members: BoardMemberSummary[];
  /** Per-project roll-up, busiest first, with unfiled work last. */
  projects: BoardProjectSummary[];
  progress: BoardProgress;
  createdAt: string;
}

/** A project the caller may file a card under — the board's project picker. */
export interface MeetingProjectOption {
  id: string;
  name: string;
  color: string | null;
  taskPrefix: string;
  workspaceId: string;
  workspaceName: string;
}

/** Lightweight row for the week switcher / admin history list. */
export interface MeetingWeekSummary {
  id: string;
  weekStart: string;
  title: string | null;
  isLocked: boolean;
  progress: BoardProgress;
  memberCount: number;
}
/* ── Notifications ── */
export interface NotificationItem {
  id: string;
  userId: string;
  sender: UserRef | null;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationCreatedEvent {
  notification: NotificationItem;
}
