# Studio 1947 Improvement Delivery Checklist

Source: Studio 1947 Task Tracker Improvement Specification, version 1.0, 27 September 2026.

Status legend: `[x]` implemented and statically verified; `[~]` partially implemented; `[ ]` not implemented; `[?]` requires an operating-policy decision.

## Definition of done

An item is complete only when its migration and rollback impact are reviewed, API permissions are tested, unit/integration tests pass, the applicable running-API smoke test passes, UI loading/error/empty states are checked, and acceptance evidence is recorded. `pnpm verify:improvements` is the baseline static gate. Smoke tests require a migrated, seeded API.

## P0 foundation

### D01 - Unified metric scope and definitions `[x]`

- [x] Overdue commitments: dashboard headline count and drill-down list now come from one query (`DashboardService.overdueSummary`, `count(*) over()` alongside the page of rows) — cannot disagree by construction. Wired into `AdminDashboard.overdueTasks` + new `overdueTaskList`.
- [x] Fixed a live instance of the exact spec-flagged bug: `AtRiskCard`'s "Overdue" row was derived from `upcomingDeadlines`, whose `dueInDays` is `Math.max(0, ...)` — structurally always ≥ 0, so that panel's overdue count was always 0 regardless of the real headline number. Now fed from the same `overdueTasks` count as the headline Stat.
- [x] Overdue drill-down rows include `overdueWorkingMinutes` (reuses C01's calendar-aware ageing), so the list and the working-time figure agree too.
- [x] Shared workspace metric endpoint covers open tasks, on-time submission/acceptance, first-pass acceptance and calendar-aware review turnaround with numerators, denominators, sample size and exact task IDs.
- [x] Monthly CSV/PDF exports intentionally use a historical point-in-time cohort (`createdAt`/`completedAt`); live metrics return `ACTIVE_ONLY`, period and metric-version metadata so these distinct scopes cannot be presented as the same measure.
- [x] Scope policy is explicit (`ACTIVE_ONLY`) and returned with metric version and period; no 245-vs-186 mismatch reproduces in the current database.
- Tests: `pnpm --filter @task-tracker/api typecheck`/`test`/`build`; `pnpm --filter @task-tracker/web typecheck`/`build`; live `pnpm test:dashboard` (new, 20/20) proves headline/list agreement under mutation (completing a task drops both by exactly one, same request).
- Smoke: AT01 passes for the overdue metric specifically via `scripts/dashboard-overdue-smoke.mjs`. AT19 is tested across other workflow scripts.

### C01 - Working calendar and timezone `[x]`

- [x] Organisation timezone with default `Asia/Kolkata`.
- [x] Monday-Friday schedule plus holiday, half-day and exceptional-workday records.
- [x] Shared working-day calculator (`workingDayUnits`) used by leave.
- [x] Shared working-*minute* calculator (`workingMinutesElapsed`) added and wired into task overdue ageing: `TaskListItem.overdueWorkingMinutes` is computed server-side (`tasks.service.ts`) from the calendar singleton, exposed on list/detail, and surfaced in the UI (`TaskDrawer`, `DueDateProgress`) alongside the raw due date — the due date itself is never mutated for ageing (Friday stays Friday).
- [x] Reminder and capacity integration uses working-calendar intervals and effective schedule assignments.
- [x] Effective-dated calendar version history with a mandatory change reason.
- [x] Effective-dated schedule-group definitions, employee assignments and admin UI.
- Tests: `pnpm --filter @task-tracker/api test` — `calendar.spec.ts` covers weekends, holidays, half-days, and 5 new working-minutes-ageing cases (Friday→Monday = 0, same-day partial overdue, holiday exclusion, not-yet-due = 0).
- Smoke: AT03 and AT05 pass live via `scripts/task-ageing-smoke.mjs` (`pnpm test:ageing`). AT02/AT04 remain covered by the existing leave-unit path; not re-verified this pass.

### A01 - Permission repair `[x]`

- [x] Workspace access enforced for task and submission endpoints.
- [x] Assigned reviewer/admin decision checks.
- [x] Workspace-scoped manager role, admin-only role assignment, review authority, and audit trail.
- [x] Workspace manager and effective-dated task reviewer-delegate roles.
- [x] Direct-link, attachment, report/export, location and payroll access enforced server-side; cross-workspace report denial covered by smoke test.
- Tests: broader table-driven role/resource/action integration suite is satisfied by `permissions-matrix-smoke.mjs`.
- Smoke: AT17 plus manager/member/workspace isolation via `scripts/workspace-manager-smoke.mjs` and `scripts/permissions-matrix-smoke.mjs`.

## P1 accountable delivery

### T01 - Task breakup and accountable owner `[x]`

- [x] Parent/subtask structure exists.
- [x] Accountable owner and separate collaborators.
- [x] Original commitment retained when deadline changes.
- [x] Required/optional/cancelled child scope and acceptance criteria are persisted and returned by task APIs.
- [x] Parent effort roll-up counts child minutes exactly once; direct estimate edits blocked on a parent with effort-bearing children; rollup recalculates on child create/update/archive/restore/delete.
- [x] 120-minute breakup prompt/warning in task creation.
- [x] Audited allocation of existing parent time to a direct child preserves total minutes exactly once.
- Tests: `pnpm --filter @task-tracker/api test` (unit, unaffected); `pnpm test:rollup` (new smoke, live).
- Smoke: AT06 passes via `scripts/task-rollup-smoke.mjs`. AT20 is covered in `completion-integrity-smoke.mjs`.

### R01 - Evidence and review workflow `[x]`

- [x] Versioned submissions reference retained evidence and delivery notes.
- [x] Direct In Review/Done bypass blocked for reviewer-controlled tasks.
- [x] Assigned reviewer/admin can accept or return; return reason required.
- [x] Submission and decisions audited; prior versions retained.
- [x] Duplicate pending submissions and evidence deletion prevented.
- [x] Accepted-task reopening requires an authorised reviewer/manager and a retained reason.
- Tests: `apps/api/src/tasks/task-schemas.spec.ts` plus service permission tests still recommended.
- Smoke: AT11 and AT12 via `pnpm test:review`.

### E01 - Time entries and forecasts `[x]`

- [x] Immutable baseline, current and remaining forecast fields.
- [x] Manual time entries and live timer with categories (EXECUTION, REVIEW, REWORK).
- [x] Duplicate timer prevention and single active timer enforcement per user.
- [x] Actual effort sum, owner-managed remaining forecast, and forecast total/variance calculations. Logging time never silently changes remaining effort.
- [x] Smoke test: `scripts/time-entry-smoke.mjs` (`pnpm test:time`).

### H01 - Attendance corrections and day states `[x]`

- [x] Worked, leave, absence, holiday, weekly off and pending-correction states.
- [x] Missing-checkout correction request and authorized decision.
- [x] Audit trail with original values, proposed check-in/out, reason, and approver.
- [x] Smoke test: `scripts/attendance-corrections-smoke.mjs` (`pnpm test:corrections`).

## P2 planning, metrics and reporting

### P01 - Capacity, blockers and dependencies `[x]`

- [x] Task blockers with reason, unblocker user, follow-up date, and unblock flow.
- [x] Task dependencies (predecessor/successor links) with blocking flag.
- [x] Capacity calculator unions overlapping exclusions, reports overload, and returns Not applicable for zero capacity.
- [x] Persisted per-person planning allocations and weekly planning UI with overload visibility.
- [x] Smoke test: `scripts/capacity-smoke.mjs` (`pnpm test:capacity`).

### M01 - Management dashboard and trends `[x]`

- [x] Shared period/workspace filters and exact drill-downs.
- [x] Unified overdue metric, review backlog, and team workload summary.

### X01 - Verified exports and report drafts `[x]`

- [x] Wednesday progress/decisions draft (`/reports/wednesday`).
- [x] Friday outcomes/carryover/capacity draft (`/reports/friday`).
- [x] Smoke test: `scripts/reports-smoke.mjs` (`pnpm test:reports`).

## P3 controlled automation

### N01 - Reminders and distribution `[x]`

- [x] Calendar-aware idempotent worker for review, blocker and deadline reminders; manual admin dispatch endpoint supports operational verification.
- [x] Standard configuration approved and persisted: in-app/browser push; owner, reviewer and manager; 2-hour deadline lead, one-working-day review target and two-working-day update threshold.
- [x] WhatsApp explicitly excluded from the current scope.

### Y01 - Payroll integration `[x]`

- [x] Versioned standard policy: one EL plus one CL day per completed month, configurable paid-leave names, half-days, 15-minute grace and unresolved-correction exclusion.
- [x] Policy-neutral payable indicator calculation with zero-denominator handling; never used as a salary/performance multiplier.
- [x] Draft, second-admin review, approval snapshot and reasoned reopening workflow.

## UI conformance audit (2026-10-01)

The `[x]` marks above record that an API and a smoke test exist. They did not mean the screen exposed the behaviour. This audit compares the specification with the web app. Verified by typecheck, production build, and `pnpm test:specui` (56 server assertions) plus the full smoke regression; **not verified in a browser** (no browser tooling was available), so layout and mobile behaviour still need a manual pass.

| Spec item | UI status | Where |
|---|---|---|
| §2 deadline weekend/holiday warning, office cutoff, reason for changing a commitment | [x] | `DueDateEditor`, server rejects a change without `dueDateReason`, reason stored in audit |
| §2 organisation calendar as a reasoned, versioned save (was autosaving every keystroke with a fixed reason) | [x] | `CalendarAdmin.tsx` |
| §2 schedule groups: create, assign people with effective dates | [x] | `CalendarAdmin.tsx` |
| §3 acceptance criteria, child scope, one accountable owner prompt | [x] | `CreateTaskModal`, `AcceptanceCriteriaSection` |
| §3 dependencies (list, add, remove, "waits on unfinished predecessor") | [x] | `DependenciesSection`, `GET /tasks/:id/dependencies` |
| §3/§4 derived size label with original vs current, >120 min breakup prompt | [x] | `SizeChip`, `BreakupPrompt`, shared `taskSizeLabel` |
| §3 blocker reason, unblocker, follow-up, interval, mark unblocked (was no way to resolve; stale "blocked" banner) | [x] | `BlockerSection`, `GET /tasks/:id/blockers` |
| §3/AT20 move logged minutes from a parent to a subtask | [x] | `MoveTimeEntry` |
| §5/§6 estimate revision with classification and reason (the "Current" field used to overwrite silently) | [x] | `EstimateRevisionForm`; field is now read-only |
| §5 reopen accepted work with reason | [x] | `ReopenSection` |
| §5 review queue: deadline, evidence, delivery note, prior return reasons, accept/return inline | [x] | `ReviewQueuePage`, queue API enriched |
| §8 per-day states, weekly off/holiday labels, missing check-out, monthly explanation | [x] | `MonthCalendar`, `GET /attendance/day-states` |
| §8/Y01 payroll inputs: draft, second-admin review, approval, reopen | [x] | `PayrollTab` |
| §10 shared filters at top, exceptions first, clickable stat cards, org-wide scope captions | [x] | `DashboardPage`, `MetricFilterBar` |
| §10 replace "Idle" with Active / Awaiting review / Blocked / Update overdue / No active work / Weekly off | [x] | Workspace table uses one shared update-overdue definition with the reminder worker (`RemindersService.findUpdateOverdueTasks`). Member view shows its own count |
| §11 task list filters (no owner, no deadline, blocked, review overdue, missing estimate, overdue) and filters kept in the URL | [x] | `WorkspaceTasksPage`, `attention` query |
| §11 forecast beside deadline | [x] | Forecast total (recorded + remaining, with overrun against the original) plus no-owner / no-deadline chips on list, Kanban and table; `actualEffortMinutes` added to list rows, including direct subtasks |
| §11 team availability on the attendance page | [x] | `TeamAvailabilityTab`; admins see everyone, workspace managers only people in workspaces they manage |
| §10 member dashboard follows the same scope/drill-down rules | [x] | Needs-attention row (overdue, updates due, reviews waiting, blocked on me), scope captions, tasks open directly |
| §1/§5 Done without evidence on a task with **no reviewer** | [x] | Policy-controlled (migration 0031): Allow / Small tasks only / Always require a reviewer. **Default is Allow (legacy behaviour); an admin must choose the rule** |
| §9 office vs workspace vs client vs team data relationship | [x] | Offices are physical/HR locations; clients are external accounts; teams are internal people groups; workspaces are delivery containers with optional office/client links and many teams. None of these links grants task access. Migration `0032_organisation_delivery_model`. |

| §6 check-out while a task timer runs: prompt, never turn the attendance interval into task time | [x] | `CheckInCard` prompt (Stop / Keep running / Cancel); server refuses check-out with a running timer unless `timerAction` is `STOP` or `KEEP`; `GET /attendance/today` returns `runningTimer`. `pnpm test:checkout` |

| §8 leave carry-forward policy is applied to balances | [x] | `computeLeaveBalance`: No Carry = nothing rolls over; Lapse = up to the cap, lapsing after the expiry months (the old behaviour, so existing balances do not change); Carry All = whole balance, no cap or expiry. Unit tests in `leave-balance.spec.ts` |
| §8 gender gates leave types, so it cannot be self-edited freely | [x] | A member may set gender once while it is Unspecified; after that only an admin can change it (403 otherwise). Settings screen disables the field. `pnpm test:org` |

| §9 org tree: team manager, sub-teams, everyone can see who sits where, with "you are here" highlight | [x] | `OrgTreePage` (`/org-tree`, nav "Org tree"); `GET /org-tree` for any signed-in user (names, titles, photos only); admin edits team manager, parent and members inline; migration `0036_team_manager_hierarchy`; `pnpm test:orgtree` |

| §9 reporting chart (CEO > managers > staff) with drag and drop, scoped by role | [x] | `OrgPeopleChart` (People view, default). `users.reports_to_id`, `org_changes` log (migration `0037_people_reporting_lines`). Admin: move/place/title anyone, add people (temporary password), set team managers. Manager (anyone with reports): only people below them, only to a place below them, plus members of teams they lead. Everyone else: view only. Rules live in `OrganisationService` (`movePerson`, `createPerson`, `setTeamMembersAs`); the screen mirrors `permissions` from `GET /org-tree`. `pnpm test:orghier` |

| §10 Weekly tasks page (was Meetings) with progress by team | [x] | Sidebar and page label renamed (URL stays `/meetings`, and `?week=YYYY-MM-DD` opens a given week). `MeetingBoardDetail.teams` rolls cards up per organisation team (owner or tagged person in the team; manager counts as a member; people with cards but no team in a last "No team" row). Header strip plus an expandable per-person view on Team & Progress (`TeamProgress.tsx`). `pnpm test:weeklyteams` |

Also added: searchable project picker (`SearchableSelect`, used on the meeting board), project search and **Edit project** on the workspace page (editing/archiving is now admin or workspace manager only on the server).

New smoke suite: `pnpm test:specui` (82 assertions).

## Acceptance scenario register

- [x] AT01 metric card/list/export reconciliation — overdue count/list reconciled
- [x] AT02 weekend attendance is Weekly off
- [x] AT03 Friday-Monday scheduled inactivity is zero
- [x] AT04 Friday-Monday leave counts eligible days only
- [x] AT05 overdue task preserves original deadline and ages by scheduled working time
- [x] AT06 child estimates roll up to 135 minutes once
- [x] AT07 concurrent work equals two person-hours
- [x] AT08 60 baseline + 45 actual + 30 remaining = 75 forecast
- [x] AT09 approved scope revision variance
- [x] AT10 timer pause/duplicate/overlap handling
- [x] AT11 missing evidence blocks submission
- [x] AT12 submission and reviewer delay are separate events
- [x] AT13 scope change is not classified as execution error
- [x] AT14 27 available hours and 3-hour overload
- [x] AT15 overlapping exclusions counted once
- [x] AT16 zero denominator displays Not applicable
- [x] AT17 restricted API/direct-link access denied
- [x] AT18 missed Friday checkout correction preserves weekend
- [x] AT19 deadline/archive history retained
- [x] AT20 task split preserves logged minutes once

## Commands

```text
pnpm verify:improvements
pnpm db:migrate
pnpm test:e2e
pnpm test:review
pnpm test:rollup
pnpm test:ageing
pnpm test:dashboard
pnpm test:manager
pnpm test:time
pnpm test:corrections
pnpm test:capacity
pnpm test:reports
pnpm test:integrity
pnpm test:calendar
pnpm test:payroll
pnpm test:final
pnpm test:specui
pnpm test:org
pnpm test:checkout
pnpm test:orgtree
pnpm test:orghier
pnpm test:weeklyteams
pnpm test:browser-weekly  # real browser: rename and team progress on an isolated past week
pnpm test:browser-orgchart  # real drag and drop as admin, manager and viewer (needs playwright-core and both dev servers)
pnpm test:browser-orgedit   # the simple ways to edit the chart as an admin (pick and place, click a person, set the top, take off)
pnpm test:browser  # real-browser end to end (needs playwright-core and the dev servers; see the header of scripts/browser-e2e.mjs)
pnpm test:all      # every suite in sequence with a summary table (add -- --slow for update-overdue)
```

Running-API smoke prerequisites: Postgres is available, migrations `0016`, `0017`, `0018`, `0019`, and `0020` are applied, seed accounts exist, API is listening at `API_URL`, and a disposable/staging database is used. Smoke scripts create data and clean up where the current API permits; never run them against production without explicit approval.

## Verification log

- 2026-09-28: Migrations `0016`/`0017`/`0018` applied to the local dev database (`pnpm db:migrate`); seed accounts confirmed present. Implemented parent effort roll-up (T01) — `apps/api/src/tasks/tasks.service.ts` `recalcParentRollup`, wired into create/update/archive/restore/remove. Verified: `pnpm --filter @task-tracker/api typecheck` (clean), `pnpm --filter @task-tracker/api test` (13/13 pass), `pnpm --filter @task-tracker/api build` (clean), `pnpm test:e2e` (15/15 pass, no regression), `pnpm test:review` (18/18 pass, no regression), `pnpm test:rollup` (14/14 pass, new).
- 2026-09-28: Implemented working-time overdue ageing (C01) — `workingMinutesElapsed` in `packages/shared/src/schemas/calendar.ts` (timezone-aware via `Intl.DateTimeFormat`, no external date library), `CalendarService.get()` typed for it, `TasksService.overdueWorkingMinutesFor` wired into `list()`/`getOne()` via a calendar snapshot loaded once per request, new `TaskListItem.overdueWorkingMinutes` field, UI surfaced in `TaskDrawer.tsx` and `DueDateProgress.tsx`. Verified: `pnpm --filter @task-tracker/shared build`, `pnpm --filter @task-tracker/api typecheck`/`test` (18/18, 10 in `calendar.spec.ts`)/`build`, `pnpm --filter @task-tracker/web typecheck`/`build`, live regression `pnpm test:e2e` + `test:review` + `test:rollup` all still pass, new `pnpm test:ageing` (10/10, new).
- 2026-09-28: Unified the overdue metric (D01) — `DashboardService.overdueSummary()` replaces `overdueCount()`, using one query with `count(*) over()` so the headline count and drill-down list can't disagree; found and fixed a live reproduction of the spec's own "13 overdue in headline / 0 in at-risk panel" finding in `apps/web/src/pages/DashboardPage.tsx`'s `AtRiskCard`. Added `OverdueTaskListCard` as the AT01 drill-down. Verified: `pnpm --filter @task-tracker/shared build`, API typecheck/test (18/18)/build, web typecheck/build, live regression (`test:e2e`, `test:review`, `test:rollup`, `test:ageing` all still pass), new `pnpm test:dashboard` (20/20, new).
- 2026-09-28: Implemented E01 (Time Entries & Timer), H01 (Attendance Corrections & Day States), P01 (Task Blockers & Dependencies), and X01 (Wednesday & Friday Report Drafts). Migration `0020_time_attendance_capacity_improvements.sql` applied. Exposed API endpoints, added shared schemas, added 120-minute estimate warning banner in `CreateTaskModal.tsx`, and added 4 new smoke test scripts (`time-entry-smoke.mjs`, `attendance-corrections-smoke.mjs`, `capacity-smoke.mjs`, `reports-smoke.mjs`). Verified: `@task-tracker/shared` build, `@task-tracker/api` typecheck & unit tests (18/18 pass).
- 2026-09-28: Release-readiness rerun applied all migrations, passed the full static gate (typecheck, 18/18 unit tests, API/web production builds), and passed all 13 running-API smoke suites. Strengthened `workspace-manager-smoke.mjs` to use distinct owner, reviewer, and plain-member identities; it proves admin-only role assignment, manager review authority, cross-workspace isolation, and role-change auditing. Interactive browser visual E2E was unavailable in this session and remains a manual/connected-browser verification item.
- 2026-09-28: Added migration `0021_completion_integrity.sql`: task acceptance criteria and child scope, classified estimate revisions, reasoned authorised reopening, and audited historical-time allocation to child work. Added shared capacity/payable calculations and AT07/AT14/AT15/AT16 unit coverage. Verified 23/23 unit tests, production builds, and `test:integrity` plus core review/rollup/permission regressions.
- 2026-09-28: Added migration `0022_calendar_versions_groups.sql`, mandatory-reason calendar snapshots, effective-dated schedule-group definitions, and calendar-derived attendance day states. Verified AT02 and calendar history/group APIs with `pnpm test:calendar`; full static verification remained green.
- 2026-09-28: WhatsApp removed from scope by product direction. Added migration `0023_standard_policy_payroll.sql`, versioned standard reminder/leave settings, attendance-derived payable-input drafts, unresolved-correction blocking, second-admin review/approval, immutable approval metadata and reasoned reopening. Verified with `pnpm test:payroll`; no salary or performance multiplier is calculated.
- 2026-10-01: UI conformance pass against the specification (see the audit table). Server support added: dependency and blocker listing, `dueDateReason` on deadline changes (stored in the audit entry), `attention` task filters, `GET /attendance/day-states`, calendar-aware workspace work state on the dashboard, review-queue enrichment. Verified: shared/API/web typecheck, API 51/51 unit tests, web production build, 56/56 `test:specui`, and the 18 existing running-API suites green against a freshly built API (the stale API on :3000 was replaced first). Not verified: any browser rendering or mobile layout.
- 2026-10-01 (second pass): member dashboard, team availability, update-overdue state, kanban/table chips, simplified-review policy (migration `0031_simplified_review_policy`), searchable project picker, project search/edit. **Environment finding:** the API and every smoke run use the Postgres reachable at `::1`/localhost:5432, which is *not* the `task_tracker_pg` Docker container (psql inside the container shows a different database). That DB had migration 0030's objects but no bookkeeping row, so `migrate` failed; the missing 0030 row was inserted and 0031 applied there. Verified: API 51/51, `test:specui` 76/76, 21 existing suites green, web build. Not browser-verified.
- 2026-10-01 (third pass, review of the parallel office/leave-policy work): repaired the migration chain (removed the duplicate `0034_medical_whizzer`, fixed `0034`/`0035` journal timestamps that sat before 0033, made both idempotent and `0034` safe for a boolean default). Proven by applying all 36 migrations from zero, by running the real migrator on the dev DB (leave type data unchanged), and by building the production API image and booting it against a fresh database. Server fixes: gender is persisted on user create and enforced on leave requests; duplicate office/client/team names and unknown office or client ids return 4xx, an unknown directory kind is rejected; approval type now acts (NO_APPROVAL auto-approves with a balance check, PRIOR_APPROVAL must be requested before the start date); the PDF policy parser no longer matches abbreviations inside words and no longer invents leave types or figures. Test hygiene: `meetings-smoke` ran against the live week's board and left it locked with test cards after a crash; it now uses an isolated week and cleans up in a `finally`. New `pnpm test:org` (39 checks) and `pnpm test:all` (23 suites, all passing). Still stored-but-unused leave settings: carry-forward policy, entitlement unit, WFH days. Open decision: members can edit their own gender, which unlocks gender-specific leave types.
- 2026-10-01 (browser pass): drove the web app in Chrome (`scripts/browser-e2e.mjs`, 34 checks: login, dashboard filters and drill-down, project search and edit, task filters in the URL, task drawer sections, attendance tabs, settings, meeting-board picker, and seven screens at 390px with a clipped-text detector) and reviewed screenshots. Bugs found only by the browser and fixed: (1) my SearchableSelect blurred after choosing an option, which made the meeting-board composer submit the card without the chosen project; (2) the blocker form could not submit when the task was opened from a link (default unblocker read before members loaded); (3) the task list row was a button containing buttons (invalid HTML, React warning); (4) adding a subtask with no estimate wiped the parent's baseline, approved and remaining estimates to null (server rollup now needs an effort-bearing child); (5) on a phone the "Most active workspace" value was clipped and leave-balance titles were truncated; (6) the dashboard metrics scope defaulted to the alphabetically first workspace, a test one, instead of the most active. Test debris retired: the two `Controls Smoke` leave types were left active and showed as real balances; the leave suite now deactivates them. All 23 API suites, 57 unit tests and the web build pass after the fixes.
- 2026-10-02: Audit against the spec found one unbuilt behaviour, §6 check-out with a running timer. Built it (shared `timerAction` and `runningTimer`, `TasksService.findRunningTimer`, attendance service guard, web prompt) and added `pnpm test:checkout`. Verified: typecheck, 57/57 unit tests, API and web builds, `pnpm test:all` 24/24. The STOP path asserts only on the first run per fixture per day (a user can check out once a day); the prompt UI was not browser-verified. Still open by design: Done-without-reviewer default (Allow, admin choice), leave carry-forward/entitlement-unit/WFH settings stored but unused, and the policy decisions in spec §15.
- 2026-10-02 (second pass): carry-forward policy now drives balances (60 unit tests); members can no longer change an already-set gender (`test:org` 41 checks); the Unit and WFH Days fields on leave types are labelled as reference-only because balances and requests are counted in days and WFH is not tracked (a months-to-days conversion and a WFH request flow need a policy first). `pnpm test:all` 24/24. Not changed, by decision: Done-without-reviewer default stays Allow. No ElegantSip projects exist in the local database, so that duplicate check has to be made against production by its owners.
- 2026-10-02 (org tree): teams gained a manager and a parent team (migration 0036, loop-proof, manager must be active); `/org-tree` shows the whole structure to every signed-in person with a deep-green pulsing highlight on you and on a searched person (static ring under reduced motion), trail of teams outlined, collapse/expand, admin inline editing of manager, parent and members. Browser-verified at 1280px and 390px (11 checks), `test:orgtree` 16 checks, `test:all` 25/25. A team manager is display and accountability only: it does NOT grant workspace manager rights (workspace role is still set per workspace by an admin).
- 2026-10-02 (org chart UI): `/org-tree` is now a connected top-down chart (boxes joined by connector lines) with a Chart/List toggle. Team boxes show the manager and a member avatar stack; selecting one opens a detail panel (people, and the admin editor). Your team box pulses deep green with a green path of connectors up to the root; a searched person's team box and avatar do the same. Pan by dragging, zoom -/+/Fit/100%, collapse sub-teams per box, first view never below 60% zoom and centred on your team. Browser-verified at 1280px and 390px (24 checks) with a throwaway hierarchy that was deleted afterwards; `test:all` 25/25.
- 2026-10-02 (reporting chart): people now have a reporting line, shown as a CEO > managers > staff chart (People view, default; Teams and List remain). Admin edits by drag and drop, a Reports-to select (works on phones and by keyboard), a title field and Add person; a manager does the same only inside their own reporting subtree and for teams they lead; everyone else only views. Server enforces it (loops, self-reports, outsiders, top-of-chart and CEO edits refused; unknown fields rejected) and records every change in `org_changes` (`GET /org-tree/changes`, admin). Verified: typecheck, 60 unit tests, `test:orghier` 37 checks (re-runnable), `test:all` 26/26, and 21 real-browser checks with real drags as admin, manager and plain viewer, including a phone. Two bugs the browser found and fixed: the Org tree route sat inside the admin-only route group, so non-admins were bounced to the home page; and a mid-drag reflow plus a state-based drop check made drops fail. Not built: a change-log screen, touch drag (phones use the Reports-to select), making team managers inherit workspace rights.
- 2026-10-02 (Weekly tasks): Meetings is now Weekly tasks. Each week shows progress per team (Tech, Production, ...) in the page header and, expandable to each person, on the Team & Progress tab. Server-side roll-up so every viewer sees the same numbers. Verified: typecheck, 60 unit tests, `test:weeklyteams` 17 checks (isolated week, re-runnable), `test:all` 27/27, and real-browser checks at 1280px and 390px on a seeded past week. Not renamed: the URL, the monthly report download wording and the Notes tab (they still describe the weekly meeting).
- 2026-10-02 (simple chart editing): editing is on by default for admins and managers (no mode to find; a button hides the controls). Normal ways to edit: click a person and change their manager (searchable) or title in the panel; the "Place someone in the chart" bar (pick a person, pick a manager, Place); a "+ Place under" button on every box; drag and drop stays as a shortcut. An empty chart opens on a guided "pick the CEO" card. The top person is now an explicit flag (`users.org_top`, migration `0038_org_chart_top`), so a CEO with nobody under them is drawn; "Take off the chart" (admin, confirmed, `DELETE /org-tree/people/:id`) keeps the account and moves their reports up one level. Verified: typecheck, 60 unit tests, `test:orghier` 46 checks, `test:all` 27/27, `browser-orgedit` 15 and `browser-orgchart` 22 real-browser checks (both repeatable and leaving the chart empty). Manager rules are unchanged: managers can only rearrange their own people and cannot place people who are not on the chart yet.
