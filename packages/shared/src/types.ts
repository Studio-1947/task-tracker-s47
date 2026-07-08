import type { Role } from './enums';

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
