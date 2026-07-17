import type { AuditAction, ConversationType, LeaveStatus, Priority, Role, TaskStatus } from './enums';

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

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarKey: string | null;
  designation: string | null;
  isActive: boolean;
  createdAt: string;
  workspaceCount?: number;
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

export interface TaskAttachment {
  id: string;
  /** Original filename, for display and download. */
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Server storage key; fetch bytes from /api/files/<storageKey>. */
  storageKey: string;
  uploader: UserRef;
  createdAt: string;
}

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

export interface AdminDashboard {
  totalWorkspaces: number;
  totalUsers: number;
  tasksByStatus: StatusCounts;
  overdueTasks: number;
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
