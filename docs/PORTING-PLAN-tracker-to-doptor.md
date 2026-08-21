# Porting Plan — Task-Tracker features → Doptor Super App

**Goal:** Bring the task-tracker's mature **Tasks depth** and **Attendance** into the
Doptor office-management tool, reusing as much as possible without breaking Doptor's
deployed multi-vertical shell.

**Direction (decided):** Doptor is home base. We port *into* Doptor; the tracker is the
reference implementation, not something we merge wholesale.

**Status of this doc:** Finalized build spec (Decisions A–D locked 2026-07-24). Nothing is
built yet — ready to start Phase 0.

---

## 0. The two repos

| | `task-tracker-s47` (source) | `Doptor-super-app-monorepo` (target) |
|---|---|---|
| Location | `~/Desktop/task-tracker-s47` | `~/Desktop/Doptor-super-app-monorepo` |
| Org | `Studio-1947` | `Studio-1947` |
| Frontend | Vite + React SPA | **Next.js App Router** |
| Backend | NestJS + Drizzle + Postgres | NestJS + Drizzle + Postgres |
| Shared pkg | `@task-tracker/shared` (zod + enums) | `frontend/shared` (zod) |
| Tenancy | single-tenant (workspace = top scope) | **multi-tenant** (`organisation_id` + RBAC everywhere) |
| Deploy | (own) | `drizzle-kit push:pg` on VPS, **migrations not automated** |

**Backend + shared schemas are portable. Frontend is NOT** (different frameworks) — the
tracker's React components become a design/logic reference for Next.js pages, not copy-paste.

---

## 1. Three systemic gaps to plan around

Every phase below has to account for these — they are why this isn't copy-paste.

1. **Tenancy.** Tracker tables have no `organisation_id`; Doptor requires it. Every ported
   table gets `organisation_id` (nullable + backfilled — see deploy constraint), and every
   ported endpoint gets org-scoping from `req.user.organisation_id` + a `@Permissions(...)`
   guard consistent with Doptor's other modules.

2. **Task-ref ownership (biggest decision).** Tracker refs (`WEB-12`) come from an atomic
   per-project counter (`projects.taskSeq`/`taskPrefix`). Doptor tasks hang directly off the
   organisation. See **§2 Decision A** — this must be answered before Phase 1.

3. **Enums vs free text.** Tracker uses pg enums (`TODO`, `MEDIUM`); Doptor uses lowercase
   `text` (`todo`, `medium`). Converging is a data migration. See **§2 Decision C**.

**Deploy constraint (from Doptor `docs/DEPLOYMENT.md` + backlog C-10):** Doptor applies
schema with `drizzle-kit push:pg` directly against the live DB. A `NOT NULL` column added to a
populated table will fail/prompt. **Rule: every new column is nullable or has a default, then
backfilled in a follow-up step; tighten to NOT NULL only after backfill.**

---

## 2. Design decisions — LOCKED (2026-07-24)

### Decision A — Task-ref counter → **Departments own refs (`DEPT-12`)**
The tracker generates `WEB-12` by atomically incrementing a per-project sequence inside the
create transaction. **DECIDED:** Doptor's existing **`departments`** own the counter —
add `task_prefix` + `task_seq` to `departments`; a task's ref is
`department.task_prefix + "-" + tasks.number`, with `tasks.number` claimed by atomically
incrementing `department.task_seq` inside the create transaction (copy the tracker's pattern
at `apps/api/src/tasks/tasks.service.ts:295`). Tasks therefore gain a required
`department_id`. No new `projects` entity is introduced.
*(Rejected: per-org counter — loses per-team prefixes; a new Projects entity — unwanted surface.)*

### Decision B — Labels → **Adopt `labels` + `task_labels` tables**
**DECIDED:** adopt the tracker's `labels`/`task_labels` tables (scoped by `organisation_id`),
migrate existing `tags` strings into labels once, then drop the `tags jsonb` column.
Colored, reusable, filterable > free strings.

### Decision C — Status/priority → **Migrate to Postgres enums**
**DECIDED:** migrate to the tracker's enum *values* as Postgres enums derived from Doptor's
shared package (single source of truth), then data-migrate existing rows
(`'todo'→'TODO'`, `'medium'→'MEDIUM'`, etc.). One-time backfill; prevents drift.

### Decision D — Attendance scope → **Separate HR attendance (Core/Office)**
**DECIDED:** port the tracker's HR attendance as a **Core/Office** capability (staff punch +
leave), org-scope all four tables, and keep it **distinct** from Doptor's existing campus
student-attendance system (do not merge).

---

## 3. Phase plan

Sequencing: **Tasks first** (Doptor already has a tasks backend + `tasks.service.ts` to
converge with → highest payoff), **Attendance second** (larger, more independent).

### Phase 0 — Fresh re-audit + decisions (no code)
- [ ] Re-audit Doptor's *current* tasks + attendance modules (docs are stale — H-8 already
      partly done). Confirm exactly what exists: `modules/tasks/*`, `modules/attendance/*`,
      `frontend/web/services/tasks.service.ts`, `frontend/web/features/tasks/*`,
      `app/tasks`, `app/attendance`.
- [ ] Lock Decisions A–D above with the team.
- [ ] Confirm Doptor's shared/zod package location + how enums are declared there.
- **Exit:** decisions signed off; a migration approach chosen that respects `push:pg`.

### Phase 1 — Tasks: schema + backend depth
Port the tracker's task model into Doptor, org-scoped and RBAC-guarded.
- [ ] **Schema** (`backend/api/src/database/drizzle/schema/`):
  - Add `task_prefix` + `task_seq` (default 0) to `departments` (Decision A).
  - Extend `tasks`: add `department_id` (ref owner), `number` (per-dept sequence backing
    the `DEPT-12` ref), `parent_task_id` (subtasks, single level), `completed_at`,
    `is_archived`. Keep `organisation_id`. Unique index on `(department_id, number)`.
  - New tables (all with `organisation_id`): `task_assignees` (M2M — replaces single
    `assigned_to`, backfill existing single assignee into the join table),
    `labels` + `task_labels` (Decision B), `task_comments`, `task_attachments`
    (file-or-link CHECK constraint from tracker).
  - Migrate `status`/`priority` `text` → enums (Decision C) with a data backfill.
  - **New per-task audit:** a task-scoped audit table (tracker's `audit_logs` shape:
    `before_value`/`after_value` jsonb, per changed field) — Doptor's existing `audit_logs`
    is login/logout events, so this is additive, name it e.g. `task_audit_logs`.
  - All column adds nullable/defaulted first (deploy constraint).
- [ ] **Service** (`modules/tasks/tasks.service.ts`): port the tracker's logic, adapted:
  - Atomic ref generation inside the create transaction (per Decision A owner).
  - Per-field audit writes **in the same transaction** as the mutation (the tracker's
    key guarantee — copy this pattern exactly).
  - Multi-assignee add/remove, label assign/toggle, comments CRUD, subtask create,
    archive/restore, list with filter/search/sort/paginate.
  - Org-scope every query from `organisation_id`; validate assignees/labels belong to the org.
- [ ] **Controller/DTO:** add endpoints + Doptor-style `@Permissions(...)` guards
  (define a `tasks:*` permission set in `DEFAULT_PERMISSIONS`; note backlog M-7 flagged the
  same gap for files). Mirror the tracker's routes (subtasks, comments, labels, assignees,
  archive/restore).
- [ ] **Shared/zod:** port task/label zod schemas into Doptor's shared package as the one
  source of truth for both API and web.
- **Verify:** create → ref assigned atomically → update fields → audit rows written in the
  same tx → multi-assign → label → comment → subtask → archive/restore, all org-scoped
  (second org sees none of it). Run against a live local Postgres.

### Phase 2 — Tasks: Next.js frontend
Rebuild the tracker's task UX in Doptor's App Router, using tracker components as reference.
- [ ] `services/tasks.service.ts`: extend for the new endpoints.
- [ ] Kanban / List / Table views + task detail drawer (inline edit, labels, comments,
      history timeline) — port UX/logic from the tracker's components, restyle onto Doptor's
      vertical theme tokens + Tailwind. Keep it **mobile-responsive** (Doptor requirement).
- [ ] Wire into `app/tasks` (and Office vertical nav). Respect RoleContext/permissions.
- **Verify:** click-through in a browser (Doptor lacked Playwright per backlog — do a manual
  pass or set it up). Confirm real API calls, no mock data, org isolation holds.

### Phase 3 — Attendance: schema + backend
Port the tracker's HR attendance (punch + leave), org-scoped (Decision D).
- [ ] **Schema:** port `attendance_records` (GPS punch, unique `user_id+work_date`),
      `leave_types`, `leave_balances`, `leave_requests` (approval workflow) — **add
      `organisation_id` to all four**, nullable+backfill. Reconcile with / replace Doptor's
      thin `attendance` table (and fix its `s_present`→`is_present` mismatch or drop it).
- [ ] **Service/controller/DTO:** punch in/out, leave request → approve/reject workflow,
      balance computation; org-scoped + `@Permissions(...)` (e.g. `attendance:*`,
      `attendance:approve`).
- [ ] **Shared/zod:** port attendance + leave zod schemas.
- **Verify:** punch in/out with geo; request leave → admin approves → balance decrements;
      org isolation.

### Phase 4 — Attendance: Next.js frontend
- [ ] Punch widget (browser geolocation), my-attendance calendar, leave request form,
      admin approval queue + balances. Reference the tracker's attendance UI; restyle for
      Doptor; mobile-responsive.
- **Verify:** manual browser pass, real API, org-scoped.

---

## 4. Explicitly out of scope / defer
- Merging the two frontends or repos (decided against — Doptor is home).
- Porting the tracker's chat/realtime (separate decision; note Doptor's `communication.gateway`
  has no socket auth — backlog M-6 — if chat is ported later, bring the tracker's
  gateway-auth-in-middleware approach).
- File-attachment *storage* backend if Doptor's `documents`/`files` upload (backlog H-7)
  isn't done yet — task attachments can start as LINK-only until real upload lands.
- Campus student-attendance is untouched (Decision D keeps HR attendance separate).

## 5. Risks / watch-items
- **`push:pg` deploy** — no NOT NULL adds against populated tables; nullable → backfill →
  tighten. Migrations are manual on the VPS.
- **Data migration** for status/priority text→enum and `tags`→labels must run once, safely.
- **RBAC gap** — tasks currently only `@UseGuards(JwtAuthGuard)` in Doptor (no `@Permissions`).
  Adding permission gates could lock out existing users until the `tasks:*` permissions are
  seeded to their roles — seed alongside the schema change.
- **Two audit systems** — keep Doptor's system `audit_logs` (auth events) separate from the
  new per-task audit; don't overload one table for both.
