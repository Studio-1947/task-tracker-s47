# Doptor Super App

## Structure

- **frontend/**: Frontend applications (Web, Mobile) and shared UI.
- **backend/**: Backend services (API, Workers, Realtime) and database schemas.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for database)

### Installation

```bash
pnpm install
```

### Running Locally

```bash
pnpm dev
```

## Architecture

See `docs/ARCHITECTURE.md` for details.

## Verticals & Navigation

Doptor is a multi-vertical app — a single organisation can run one or more of:

- **Core** — cross-vertical dashboard, tasks, approvals, communication, attendance
- **Office** — e-Dak file workflow (inbox/outbox/forward/approve), file registry,
  team management, org administration
- **Campus** — academics (courses/departments/years/classes), faculty, students,
  attendance
- **Network** — volunteers, campaigns *(early-stage, not yet a focus area)*

An organisation only sees the verticals it actually enabled at signup
(`enabled_verticals` on the organisation record) — the icon rail on the far left
(`VerticalSwitcher`) shows only those, plus Core.

**How it's wired (`frontend/web/`):**
- `contexts/VerticalContext.tsx` is the source of truth: it derives the active
  vertical from the URL itself (`/campus/...` → campus, `/office/...` → office,
  else core) rather than independent click-state, so deep links and browser
  back/forward stay correct. It also fetches the org's real `enabled_verticals`
  and redirects back to `/` if a URL is reached for a vertical the org hasn't
  enabled. Per-vertical color tokens (`verticalTheme`) live here too, consumed by
  `Header`, `VerticalSwitcher`, and the per-vertical layout wrappers
  (`app/campus/layout.tsx`, `app/office/layout.tsx`).
- `features/auth/RoleContext.tsx` derives the user's nav-relevant role from the
  real RBAC data (`user.roles` from `/auth/me`), translated down to a legacy
  5-tier enum (`super_admin | org_admin | manager | staff | student`) that
  `Sidebar`/`BottomNav` menus are keyed by.
- `components/layout/Sidebar.tsx` (desktop) and `BottomNav.tsx` (mobile) render
  `verticalMenus[activeVertical][role]` — the same menu data source for both, so
  the two surfaces can't drift.

Known gap: `middleware.ts` does not yet do real server-side route protection
(it's effectively inert). This isn't a security hole — the backend enforces real
permission checks on every endpoint — but direct-navigation UX for a
disabled/unauthorized route relies on the client-side guard above, not the edge.
Fixing this properly means moving auth tokens from `localStorage` to a
cookie middleware can read — tracked in `docs/BACKLOG.md`, not yet scheduled.

## Onboarding & Invitations

Getting a user into an organisation works in two ways:

1. **Founder signup** — `POST /auth/register-organisation` creates the
   organisation, the first user, and an "Organisation Admin" role seeded with a
   full default permission set (so the admin isn't locked out of anything
   permission-gated from the first login).
2. **Invite flow** — an admin (or the campus module, for faculty/students) calls
   `POST /users/invite` (or `/users/invite/bulk`). This creates the invitee in an
   `invited` state with an unusable placeholder password, emails them a
   `/accept-invite?token=...` link, and — once they set a real password via
   `POST /auth/accept-invite` — flips them to `active` and logs them in
   immediately. Pending invites can be resent (`POST /users/:id/resend-invite`,
   org-scoped) or will simply expire after 7 days and can be reissued.

Both office ("Invite Member" on the Team page) and campus (Add Faculty/Student,
including bulk CSV upload) use this same underlying invite service — there's one
invitation system, not two parallel ones.

See [`docs/BACKLOG.md`](docs/BACKLOG.md) for the full, current build status: what's
shipped and verified, what's in progress, and the prioritized list of what's left
across onboarding, Campus, Office, and shared platform modules.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — how the app is deployed to the
VPS, how to reproduce it on a fresh server, how to add a new project to the same
server, and troubleshooting for every issue encountered during setup.
