# Product Requirements Document — Inhouse Task Tracker (MVP)

**Version:** 1.0
**Status:** Draft for review
**Owner:** [You]
**Last updated:** July 2026

---

## 1. Summary

A lightweight, self-hosted task tracker for internal team use. An **Admin** creates and manages **Workspaces**, invites/creates **Users**, and assigns users to one or more workspaces. Within a workspace, tasks are visible and manageable in **Kanban**, **List**, and **Table** views, with a full **audit/history log** per task. Admins get a global **dashboard**; regular **Members** only see their own tasks and the tasks of the workspace(s)/teams they belong to.

**Goals:** fast to build, fast to run, minimal but not fragile. Optimize for a small internal user base (tens to low hundreds of users), not internet scale.

---

## 2. Roles & Permissions

| Capability | Admin | Member |
|---|---|---|
| Create/edit/archive workspaces | ✅ | ❌ |
| Create/edit/deactivate users | ✅ | ❌ |
| Assign users to workspaces | ✅ | ❌ |
| View all workspaces & all tasks | ✅ | ❌ (only assigned workspaces) |
| View global dashboard (cross-workspace analytics) | ✅ | ❌ |
| Create/edit/delete tasks in their workspace | ✅ | ✅ (own workspace only) |
| Assign tasks to other members in the workspace | ✅ | ✅ (configurable — see open question §9.1) |
| View task history/audit log | ✅ (all) | ✅ (own workspace only) |
| Change own profile/password | ✅ | ✅ |

There are only **two roles** in MVP: `ADMIN` and `MEMBER`. No per-workspace roles (e.g. "workspace manager") in v1 — flagged as a fast-follow in §8.

---

## 3. Core Features (MVP Scope)

### 3.1 Workspace Management (Admin only)
- Create / rename / archive workspace
- Each workspace has: name, description, color/icon (optional), created date, member list
- Admin can add/remove members from a workspace at any time
- A user can belong to **multiple** workspaces

### 3.2 User Management (Admin only)
- Create user (name, email, role, initial password or invite link)
- Edit user (name, role, active/inactive)
- Deactivate (soft-disable login) rather than hard-delete, to preserve task history integrity
- Bulk-assign a user to one or more workspaces

### 3.3 Task Management
- Task fields: title, description (rich text or markdown), status, priority, assignee(s), due date, labels/tags, workspace, created by, created at, updated at
- Status is workspace-configurable but ships with a sane default: `To Do → In Progress → In Review → Done`
- Subtasks/checklist items (nice-to-have, see §8)
- Comments on a task (recommended — see §9.2)
- **Human-readable task ID:** each task gets a short workspace-scoped reference (e.g. `ENG-142`), generated from a per-workspace sequence counter — makes tasks referenceable in chat/commit messages, not just clickable links
- **Search:** a search bar across task title/description within a workspace (simple `ILIKE`/Postgres full-text search is sufficient for MVP scale — no need for Elasticsearch)

### 3.4 Views
- **Kanban board** — drag-and-drop between status columns, grouped by status (default) or by assignee
- **List view** — flat, filterable, sortable list of tasks (good for quick scanning/mobile)
- **Table view** — spreadsheet-like, sortable/filterable/groupable columns, inline edit of status/assignee/due date
- All three views read from the same underlying task query — they are just different renderers, not different data models

### 3.5 History / Audit Log
- Every mutating action on a task is recorded as an immutable log entry: who did it, what changed (before/after), and when
- Tracked events: created, status changed, assignee changed, priority changed, due date changed, comment added, archived/deleted
- Displayed as a timeline on the task detail view
- Admin can view a global activity feed across all workspaces; members see activity scoped to their workspace(s)

### 3.6 Dashboards
- **Admin dashboard:** total workspaces, total users, tasks by status across all workspaces, overdue tasks count, most active workspace, recent activity feed
- **Member dashboard/home:** "My tasks" (assigned to me, sorted by due date/priority), "My workspace tasks" (everything in workspaces I belong to), recent activity in my workspace(s)

### 3.7 Authentication
- Email + password login, JWT access token (short-lived, ~15 min) + refresh token (longer-lived, httpOnly cookie)
- Passwords hashed with bcrypt/argon2
- Role-based route guards on both API and frontend
- No self-signup in MVP — Admin creates all accounts (typical for inhouse tools; prevents account sprawl)
- **Onboarding flow (decision needed — see §11.1):** when Admin creates a user, the system either (a) generates a temporary password shown once to the Admin to relay manually, or (b) emails a set-password invite link with a short-lived token. Option (a) needs no email infra and is faster to ship; option (b) is more standard but requires an email-sending service (e.g. SMTP/Resend/SES) as a new dependency.
- **Token invalidation on deactivation:** when an Admin deactivates a user, that user's refresh token must be revoked immediately (e.g. a `tokenVersion` counter on the `User` row, bumped on deactivation and checked on every refresh) so access doesn't merely lapse at next natural expiry — deactivation should mean "locked out now," not "locked out in 15 minutes."

---

## 4. Recommended Tech Stack (with rationale)

| Layer | Choice | Why |
|---|---|---|
| Frontend build | **Vite + React + TypeScript** | Fastest dev loop, you already chose this — TS strongly recommended even for an "inhouse" tool since task/status shapes will change and you want compiler safety |
| Styling | **Tailwind CSS + shadcn/ui** | shadcn gives you accessible, unstyled-but-themeable components (dialogs, dropdowns, tables) without a heavy design system — pairs perfectly with Tailwind, and you own the code (no black-box library) |
| Data fetching / cache | **TanStack Query (React Query)** | Handles caching, refetching, optimistic updates (critical for drag-and-drop Kanban) far better than manual `useEffect` fetching |
| Table view | **TanStack Table** | Headless, handles sorting/filtering/grouping/virtualization without dictating markup — fits Tailwind styling |
| Kanban drag-and-drop | **dnd-kit** | Modern, actively maintained, accessible; `react-beautiful-dnd` is deprecated/unmaintained — avoid it |
| Client state (non-server) | **Zustand** | For light UI state (active view, filters, modals) — avoids Redux boilerplate |
| Forms | **React Hook Form + Zod** | Schema validation shared in spirit with backend DTOs |
| Backend framework | **NestJS** | You already chose this — good fit: built-in DI, Guards for RBAC, Interceptors for audit logging, modular structure scales cleanly |
| ORM | **Drizzle ORM** | Lightweight, SQL-first (queries read like SQL, no hidden query-generation magic), fully type-safe end-to-end with TypeScript, fast cold-start/runtime (no separate query-engine binary like Prisma has), and `drizzle-kit` gives clean, readable, diffable migrations. Nest doesn't ship an official Drizzle integration the way it does for TypeORM — wire the Postgres client + Drizzle instance as an injectable provider inside a single `DatabaseModule` once, then inject it wherever needed; a few lines of setup, not a real cost |
| Database | **PostgreSQL** | Correct choice — relational integrity for users/workspaces/tasks, JSONB available if you need flexible fields later |
| Auth | **Passport.js (JWT strategy) inside NestJS**, access+refresh token pattern | Standard, well-documented, integrates cleanly with Nest Guards for role checks |
| Realtime (optional, phase 2) | **Socket.io** or **NestJS WebSocket Gateway** | For live task updates across users viewing the same board — not required for MVP, flagged as fast-follow |
| Hosting (suggested) | Single VM or small container setup (e.g. Docker Compose: Postgres + Nest + static Vite build behind Nginx) | Inhouse tool = no need for k8s/microservices; keep ops minimal |

**Overall architecture:** monolith backend (NestJS modules: `auth`, `users`, `workspaces`, `tasks`, `audit-log`), single Postgres instance, single-page React app. This is intentionally boring — for an internal tool with tens/hundreds of users, a modular monolith is faster to build, easier to debug, and easier to hand off than microservices.

---

## 5. Data Model (Core Entities)

```
User
 - id, name, email, passwordHash, role (ADMIN | MEMBER), isActive, createdAt

Workspace
 - id, name, description, isArchived, createdAt, createdById (FK -> User)

WorkspaceMember   (join table: User <-> Workspace, many-to-many)
 - id, userId (FK), workspaceId (FK), joinedAt

Task
 - id, workspaceId (FK), title, description, status, priority,
   dueDate, createdById (FK -> User), createdAt, updatedAt, isArchived

TaskAssignee      (join table: Task <-> User, many-to-many — supports multiple assignees)
 - id, taskId (FK), userId (FK)

TaskLabel / Label (optional tagging)
 - id, name, color

TaskComment (recommended addition, see §9.2)
 - id, taskId (FK), userId (FK), body, createdAt

AuditLog
 - id, workspaceId (FK), taskId (FK, nullable), userId (FK, actor),
   action (enum: CREATED, STATUS_CHANGED, ASSIGNEE_CHANGED, PRIORITY_CHANGED,
   DUE_DATE_CHANGED, COMMENTED, ARCHIVED, DELETED),
   beforeValue (jsonb, nullable), afterValue (jsonb, nullable), createdAt
```

**Key design decisions:**
- `WorkspaceMember` and `TaskAssignee` are explicit join tables (not just arrays) — keeps relational integrity and makes "which workspaces is this user in" and "who's this task assigned to" simple indexed queries.
- `AuditLog.beforeValue`/`afterValue` as JSONB — flexible enough to log any field change without a rigid schema per action type.
- Soft-delete via `isArchived` flags rather than hard deletes — preserves audit trail integrity (an audit log referencing a hard-deleted task is broken/orphaned).

---

## 6. High-Level API Surface (NestJS modules)

```
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

GET    /users                (admin only)
POST   /users                (admin only)
PATCH  /users/:id            (admin only)

GET    /workspaces                    (admin: all; member: own only)
POST   /workspaces                    (admin only)
PATCH  /workspaces/:id                (admin only)
POST   /workspaces/:id/members        (admin only — add/remove user)

GET    /workspaces/:id/tasks?view=kanban|list|table&filter=...
POST   /workspaces/:id/tasks
PATCH  /tasks/:id                     (status, assignee, priority, due date, etc.)
DELETE /tasks/:id                     (soft-delete/archive)
POST   /tasks/:id/comments

GET    /tasks/:id/history             (audit log for one task)
GET    /workspaces/:id/activity       (workspace-scoped feed)
GET    /admin/dashboard               (admin only — cross-workspace stats)
GET    /me/dashboard                  (member — "my tasks" + workspace tasks)
```

All `GET` list endpoints support pagination + filtering (status, assignee, priority, due-date range) so Kanban/List/Table can share one query layer with different render logic on the frontend.

---

## 7. Non-Functional Requirements

- **Performance:** sub-200ms API response for task list queries under expected load (low hundreds of concurrent users, thousands of tasks) — achievable with plain indexed Postgres queries, no need for caching layer in MVP
- **Security:** bcrypt/argon2 password hashing, JWT with short-lived access tokens, httpOnly refresh cookie, RBAC guards on every mutating route, input validation via `class-validator` DTOs
- **Auditability:** every task mutation must produce exactly one audit log row — enforce this via a NestJS Interceptor or service-layer wrapper, not scattered manual calls, to avoid missed logs
- **Data integrity:** foreign keys enforced at the DB level (Postgres), no orphaned records
- **Availability:** single-instance deployment acceptable for MVP; no HA requirement given inhouse scale

---

## 8. Explicitly Out of Scope for MVP (fast-follows)

- Per-workspace custom roles (e.g. "workspace lead")
- Custom/configurable status columns per workspace (ship with one fixed default pipeline first)
- Real-time collaborative updates (websockets) — v1 can rely on polling/refetch-on-focus via React Query
- File attachments on tasks
- Notifications (email/in-app)
- Self-service signup / SSO (Google/Okta)
- Subtasks/checklists within a task
- Recurring tasks

---

## 9. Open Questions for You to Decide

**9.1 — Can Members create tasks and assign them to other members, or only to themselves?**
Recommendation: allow Members to create tasks in their own workspace and assign to anyone in that workspace — restricting this typically causes friction in small teams and adds little security value since it's all inhouse.

**9.2 — Do you want comments on tasks in MVP?**
Not in your original spec, but almost every task tracker needs a comment thread within the first week of real use. Recommendation: include it now — it's cheap to build alongside the audit log (comments can literally be one `AuditLog` action type) and expensive to bolt on later.

**9.3 — Single assignee or multiple assignees per task?**
Your spec didn't say. Modeled above as many-to-many to keep it flexible, but if you want to simplify to single-assignee for MVP, that's a one-column change (`assigneeId` on `Task` instead of a join table) — cheaper to build, slightly less flexible.

---

## 11. Additional Considerations

These didn't make the original spec but are the kind of thing that normally gets discovered mid-build and causes rework if left undecided. Recommended defaults are given for each; flag any you'd rather decide differently.

**11.1 — User onboarding / credential delivery**
Decision needed: temp password shown to Admin once (no email infra needed, fastest to ship) vs. emailed invite link with a set-password token (more standard UX, requires an email-sending dependency). *Recommendation for MVP:* temp password shown once in the Admin UI — defer email invites to a fast-follow once you've decided on an email provider.

**11.2 — Token invalidation on deactivation**
Already folded into §3.7 above — a `tokenVersion` check on refresh so deactivation takes effect immediately rather than at next token expiry.

**11.3 — Human-readable task IDs & search**
Already folded into §3.3 above.

**11.4 — Concurrent edits**
Two people acting on the same task at once (e.g. both dragging it on Kanban, or one editing while another comments) needs a stated policy, not an accident. *Recommendation:* last-write-wins for MVP — the audit log still captures both changes in order, so nothing is silently lost even if one overwrites the other. Optimistic locking (version field + conflict error) is a reasonable fast-follow if this causes real friction.

**11.5 — API error response conventions**
Standardize a single error shape across all endpoints: HTTP status code, a machine-readable error code, a human-readable message, and field-level validation errors where relevant (NestJS's built-in `ValidationPipe` + a global exception filter can produce this consistently). Prevents the frontend from needing bespoke error-handling per endpoint.

**11.6 — Testing & CI**
Minimal but non-zero: unit tests on service-layer logic (especially the audit-log interceptor, since a silent miss there defeats the point of §3.5), one end-to-end smoke test covering login → create task → change status, and a CI pipeline (e.g. GitHub Actions) that runs both on every push. Keeps regressions from shipping silently on a small team with no dedicated QA.

**11.7 — Environments & configuration**
Explicit dev / staging / prod separation, with all secrets (DB credentials, JWT signing secret, etc.) read from environment variables (`.env` locally, real secrets manager or platform env vars in staging/prod) — never committed to the repo. Prevents "works on my machine" surprises and accidental secret leaks.

**11.8 — Database backup policy**
Even a minimal daily `pg_dump` cron job with rotation (e.g. keep last 14 days) run against the Postgres instance. Inhouse tools tend to get treated as disposable until someone loses a week of task history — cheap insurance against that.

**11.9 — UI states**
Every view (Kanban/List/Table, dashboards) needs explicit empty-state, loading-state, and error-state designs — not just the "happy path with data" — called out here so it's budgeted into frontend build time rather than discovered as a gap during QA.

**11.10 — Success metrics**
A few informal ship-readiness metrics, so "done" is checkable rather than vibes-based:
- Admin can create a workspace, add users, and have them see it — in under 5 minutes, no docs needed
- A task created on one view (e.g. Table) appears correctly and immediately on the other two views (Kanban, List)
- Every task mutation produces a visible, correct audit log entry with no exceptions
- A Member can never see a workspace or task outside their assigned workspace(s), verified by test

---

## 12. Suggested Build Order (fastest path to a usable v1)

1. **Auth + Users + Workspaces** (Admin can log in, create workspaces, create/assign users)
2. **Task CRUD + List/Table view** (simplest view first — no drag-and-drop complexity)
3. **Audit log wiring** (build the Interceptor pattern early so every subsequent feature logs automatically)
4. **Kanban view** (reuses the same task API, adds dnd-kit + optimistic status updates)
5. **Dashboards** (Admin global stats, Member "my tasks" home)
6. **Polish pass:** comments, labels, filters, empty states, loading states

This order front-loads the riskiest/most foundational pieces (auth, RBAC, audit logging pattern) so later features just plug into an already-solid base rather than requiring rework.
