# Task Tracker

A lightweight, self-hosted task tracker for internal team use (Kanban / List / Table
views, per-task audit log, RBAC). Built as a pnpm + Turborepo monorepo.

See [`task-tracker-prd.md`](./task-tracker-prd.md) for the full product spec.

## Stack

| Layer     | Choice |
|-----------|--------|
| Monorepo  | pnpm workspaces + Turborepo |
| Backend   | NestJS + Drizzle ORM + PostgreSQL |
| Frontend  | Vite + React + TypeScript + Tailwind v4 + TanStack Query |
| Auth      | Passport JWT (access) + httpOnly refresh cookie, argon2 hashing |
| Shared    | `@task-tracker/shared` — zod schemas, enums, types (one source of truth) |

## Layout

```
apps/
  api/     NestJS API (auth, users, workspaces; tasks/audit schema ready)
  web/     React SPA (login, dashboard, workspaces, users)
packages/
  shared/  zod schemas + enums + types shared by api & web
deploy/    VPS deploy guide + backup script
docker-compose.yml        local Postgres
docker-compose.prod.yml   full prod stack (postgres + api + web/nginx)
```

## Prerequisites

- Node 22+, pnpm 10+, Docker + Docker Compose

## Quick start (local dev)

```bash
pnpm install
cp .env.example .env          # defaults work for local dev

pnpm db:up                    # start Postgres in Docker
pnpm --filter @task-tracker/shared build   # build shared once
pnpm db:migrate               # apply migrations
pnpm db:seed                  # create the seed admin (admin@example.com / admin12345)

pnpm dev                      # api on :3000, web on :5173 (proxies /api)
```

Open http://localhost:5173 and sign in with the seeded admin.

> First run: `pnpm dev` starts `shared` in watch mode alongside the apps. If the API
> can't resolve `@task-tracker/shared` on a cold start, run the one-time
> `pnpm --filter @task-tracker/shared build` above (already included in the steps).

## Common scripts

| Command | What |
|---|---|
| `pnpm dev` | Run api + web (+ shared watch) via Turborepo |
| `pnpm build` | Build everything |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run unit tests |
| `pnpm db:up` / `pnpm db:down` | Start / stop local Postgres |
| `pnpm db:generate` | Generate a new Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm db:seed` | Seed the admin user |

## What's built

- ✅ Monorepo + Docker Postgres + Drizzle schema & migrations (all core entities)
- ✅ Auth: login / refresh / logout, RBAC guards, `tokenVersion` instant lockout,
  temp-password onboarding, forced password change
- ✅ Users (admin CRUD) + Workspaces (CRUD, membership, task-prefix)
- ✅ **Tasks**: create (atomic `ENG-142` refs), list with filter/search/sort/paginate,
  detail, update, archive (soft-delete), multi-assignee, comments
- ✅ **Audit log**: every task mutation writes one immutable row *in the same
  transaction* (one row per changed field); per-task history + workspace/global
  activity feeds
- ✅ **Kanban** view (dnd-kit) with drag-to-change-status + optimistic updates
- ✅ **Dashboards**: admin global stats (workspaces/users/overdue/tasks-by-status/most-active
  + activity feed) and member "my tasks" home (scoped to your workspaces)
- ✅ **Labels**: per-workspace label CRUD, assign/toggle on tasks (chips on rows +
  Kanban cards, inline create in the drawer), filter tasks by label
- ✅ **Saved filters** persisted per workspace + reset; richer empty states
- ✅ Web: auth flow, workspaces, users admin, a **workspace task board with
  List + Table (TanStack Table) + Kanban views** + a task detail drawer (inline edit,
  labels, comments, history timeline), and role-aware dashboards — all with
  loading/empty/error states, **mobile-responsive** throughout

## Status

All of the PRD §12 build order (steps 1–6) is complete. Remaining work is the
explicit fast-follows from PRD §8: subtasks/checklists, notifications, realtime
(websockets), file attachments, per-workspace custom statuses/roles, self-signup/SSO.

## Deployment

See [`deploy/README.md`](./deploy/README.md).
