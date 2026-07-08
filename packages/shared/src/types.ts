import type { AuditAction, Priority, Role, TaskStatus } from './enums';

/** Shape of the authenticated user echoed by the API (never includes passwordHash). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
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
  description: string | null;
  color: string | null;
  taskPrefix: string;
  isArchived: boolean;
  createdAt: string;
  memberCount?: number;
}

export interface UserRef {
  id: string;
  name: string;
  email: string;
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
  number: number;
  /** Human-readable reference, e.g. "ENG-142" (prefix + number). */
  ref: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  assignees: UserRef[];
  labels: LabelRef[];
  commentCount: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskListItem {
  description: string | null;
  createdBy: UserRef;
}

export interface TaskComment {
  id: string;
  body: string;
  user: UserRef;
  createdAt: string;
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
