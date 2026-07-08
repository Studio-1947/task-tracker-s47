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

## What's built (foundation)

- ✅ Monorepo + Docker Postgres + Drizzle schema & migrations (all core entities)
- ✅ Auth: login / refresh / logout, RBAC guards, `tokenVersion` instant lockout,
  temp-password onboarding, forced password change
- ✅ Users (admin CRUD) + Workspaces (CRUD, membership, task-prefix)
- ✅ Web: auth flow, dashboard, workspaces, users admin — with loading/empty/error states

## Next (per PRD §12 build order)

2. Task CRUD + List/Table views
3. Audit-log interceptor wiring
4. Kanban (dnd-kit + optimistic updates)
5. Dashboards (admin global + member home)
6. Polish: comments, labels, filters

## Deployment

See [`deploy/README.md`](./deploy/README.md).
