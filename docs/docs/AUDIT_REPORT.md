
# Doptor Super App — Repository Audit Report

Date: 2026-06-30
Scope: full monorepo, with emphasis on `doptor-campus` and `doptor-office`.

## 1. Repo-wide hygiene

- **~45 stray build/debug log files** scattered across the repo, none gitignored:
  - Root (25 files): `build_log*.txt`, `install_log*.txt`, `web_build*.log`, `npm_ls*.txt/.log`, `my_build_log*.txt`.
  - `frontend/web/` (24 files): `build_*.log/.txt`, `ts_errors.txt`, `tsc_errors.txt`, `lint_report.json`, `build_verification*.txt`, etc.
  - `backend/api/` (3 files): `build_log.txt`, `build_log_2.txt`, `seed_error.txt`.
  - These are pure debugging-session residue and should be deleted and added to `.gitignore`.
- **Mixed package managers**: root declares `packageManager: pnpm@9.1.0` and a pnpm workspace, but `backend/package-lock.json` and `frontend/package-lock.json` (npm) sit alongside `frontend/pnpm-lock.yaml`. This risks two different dependency trees being installed depending on which tool a contributor runs.
- **`infra/` referenced but absent**: `pnpm-workspace.yaml` and `README.md` both reference an `infra/` package for Docker/K8s/Terraform — directory does not exist.
- **`frontend/mobile`** is a skeleton: only `package.json` (React Native deps), zero source files. Not started.
- **`.env` files are correctly gitignored** (none tracked in git).
- Git history is small (24 commits) — early-stage project, consistent with the amount of scaffolding/stub code found.

## 2. Backend (`backend/api` — NestJS + Drizzle)

### Module status

| Module | Status |
|---|---|
| campus | Functional (faculty/students/courses/departments/classes/attendance), but **untyped** — no `dto/` folder, `@Body() body: any` throughout |
| office | **Does not exist** as a backend module |
| auth, attendance, communication, departments, documents, organisations, permissions, roles, tasks, users, workflows | Complete, consistent controller/service/dto pattern |
| email | Service-only (no controller), correct by design |
| files | Complete but imports guards from the wrong place (see below) |
| analytics | Near-stub — single `GET /analytics/overview` route |

### Key findings

1. **No backend support for office management.** The only trace of "office" is a string literal in the `vertical` enum (`organisation-module.schema.ts`) and seed data (`enabled_verticals: ["office","campus","network"]`). There is no `office.module.ts`, controller, service, or schema. The frontend `office/` routes have nothing real to call.
2. **Duplicate guard implementations**: `src/common/guards/*` (used by 12/14 modules) vs `src/modules/auth/guards/*` (used only by `campus` and `files`). Two sources of truth for JWT/roles guards.
3. **Duplicate schema files**: `audit.schema.ts` and `audit-log.schema.ts` both exist in `database/drizzle/schema/` — looks like a leftover from an in-progress rename.
4. **`campus` module lacks DTOs/validation** — inconsistent with every other module.
5. **NestJS version mismatch** in `package.json`: core packages pinned `^10.0.0`, but `platform-socket.io`, `websockets`, `swagger`, `throttler` are `^11.x`. Cross-major dependency risk.
6. Migrations (3 files) and schema/meta are otherwise clean and consistent.

## 3. Frontend (`frontend/web` — Next.js App Router)

### `campus/` (main focus — 16 pages)

- `academics/*` (classes, courses, departments, faculty, years), `faculty/*`, `students/*`, `results/` — built, backed by `features/campus/*` components.
- `attendance/page.tsx` and `timetable/page.tsx` are **stub redirects** (`redirect('/campus/attendance/mark')`, `redirect('/campus')`) despite a real `features/campus/TimeTable.tsx` existing unused.
- **All campus data is backed by `*-mock.db.ts` files**, not the real API. A `services/campus.service.ts` exists but it's unclear how much is actually wired vs. mocked.

### `office/` (main focus — 7 pages)

- `page.tsx`, `files/*`, `admin/`, `reports/`, `team/` — built.
- `registry/page.tsx` is an explicit `<ComingSoon>` stub.
- **Duplicate feature trees**: `features/office/*` (FileDashboard, FileList, FileInbox, NoteSheetEditor) overlaps with a separate `features/verticals/office/` (EmployeeRegistry, FileMovementSystem) — looks like an abandoned partial restructuring. No other vertical has this split.
- Also backed by mock data only (`office-mock.db.ts`), no confirmed real backend wiring (consistent with backend finding #1 above — there's nothing to wire to yet).

### Cross-cutting frontend issues

1. **Four overlapping auth/route-guard mechanisms**: `components/auth/AuthGuard.tsx`, `components/auth/ProtectedRoute.tsx`, `lib/withRoleProtection.tsx`, `features/auth/RoleContext.tsx`. Only `AuthGuard` is actually wired into `app/layout.tsx` — the other three appear dead.
2. **`middleware.ts` only protects `/campus/*`** routes, via a hardcoded cookie-based role map with a `// TODO: Replace with actual authentication check` left in place. `/office`, `/admin`, `/network` have **no route-level protection at all**.
3. **`components/` vs `features/` boundary is blurry** — `components/ui/` has only one real file (`ThemeToggle`); nearly all actual UI logic lives under `features/*`. Reasonable by domain, but the split with `components/` isn't doing much.
4. Stub pages (`campus/timetable`, `campus/attendance` index, `office/registry`, several `network/*` pages) are mixed in next to finished pages with no labeling/tracking distinguishing "done" from "placeholder."
5. **`lucide-react` version mismatch** between `frontend/web` (`^0.563.0`) and `frontend/shared` (`^0.453.0`) — risk of duplicate bundled copies.
6. `frontend/shared` is genuinely used (44 import sites for zod schemas + 3 shared UI primitives), matching `ARCHITECTURE.md`'s intent — not dead code, just thin.

## 4. Summary: campus vs office maturity

| Layer | Campus | Office |
|---|---|---|
| Backend module | Partial (real handlers, no DTOs) | **None** |
| Backend schema | `campus.schema.ts` exists | **None** (only a vertical-flag string) |
| Frontend pages | Mostly built, 2 stub redirects | Mostly built, 1 explicit stub, duplicated feature tree |
| Data source | Mock DB files | Mock DB files |
| Route protection | Partial (middleware covers `/campus/*` only) | **None** |

**Bottom line:** Campus is the more mature vertical end-to-end but still mock-data-only and missing DTO validation. Office is frontend-only — there is no real backend for it yet, and its frontend feature code is internally duplicated/forked.

## 5. Prioritized issue list (for cleanup phasing)

1. No backend `office` module/schema — needs to be designed and built from scratch.
2. Duplicate `features/office` vs `features/verticals/office` — resolve before building backend integration, so we don't wire two trees.
3. Duplicate backend guards (`common/guards` vs `auth/guards`) and duplicate schema (`audit.schema.ts` vs `audit-log.schema.ts`).
4. `campus` backend module missing DTOs/validation.
5. Route protection gaps: middleware only covers `/campus/*`; `/office` and others are unprotected; four redundant frontend auth-guard implementations need consolidation to one.
6. Mock-data dependency across both campus and office — real API wiring status needs to be confirmed module-by-module before "done" claims.
7. ~45 stray build/log files repo-wide — delete + gitignore (quick win, zero risk).
8. Dependency hygiene: mixed npm/pnpm lockfiles, NestJS `^10`/`^11` mismatch, `lucide-react` version mismatch across workspace packages.
9. `infra/` referenced in workspace config but missing; `frontend/mobile` is an empty skeleton — both need a scope decision (build now / remove reference / defer explicitly).
