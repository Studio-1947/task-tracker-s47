#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers the server support added for the UI/UX pass over the Studio 1947
// specification: dependency listing, deadline-change reasons, planning-hygiene
// filters, per-day attendance states, calendar-aware workspace state, and the
// enriched review queue.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
};

let failures = 0;
function assert(ok, message, extra = '') {
  if (ok) console.log(`PASS ${message}`);
  else { failures += 1; console.error(`FAIL ${message}${extra ? ` - ${extra}` : ''}`); }
}

async function call(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text }; }
  return { status: res.status, body: parsed };
}

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

async function main() {
  const login = await call(null, 'POST', '/auth/login', ADMIN);
  const token = login.body?.accessToken;
  if (!token) throw new Error(`Login failed: ${login.status}`);
  const me = login.body.user;

  const ws = await call(token, 'POST', '/workspaces', { name: `Spec UI Smoke ${Date.now()}` });
  assert(ws.status === 201, 'workspace created', JSON.stringify(ws.body));
  const workspace = ws.body;
  try {
    const projects = await call(token, 'GET', `/workspaces/${workspace.id}/projects`);
    const project = projects.body?.[0];
    // Owners and reviewers must be workspace members.
    const everyone = await call(token, 'GET', '/users');
    const other = everyone.body.find((u) => u.id !== me.id && u.isActive && u.role !== 'ADMIN') ?? everyone.body.find((u) => u.id !== me.id && u.isActive);
    const added = await call(token, 'POST', `/workspaces/${workspace.id}/members`, { add: [me.id, ...(other ? [other.id] : [])] });
    assert(added.status === 201, 'owner and reviewer added to the workspace', `${added.status} ${JSON.stringify(added.body)}`);
    const mk = async (extra) => {
      const r = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, { projectId: project.id, ...extra });
      assert(r.status === 201, `fixture task "${extra.title}" created`, `${r.status} ${JSON.stringify(r.body)}`);
      return r;
    };

    // ---- dependencies list -------------------------------------------------
    const a = await mk({ title: 'Predecessor' });
    const b = await mk({ title: 'Successor' });
    const dep = await call(token, 'POST', '/tasks/dependencies', { predecessorTaskId: a.body.id, successorTaskId: b.body.id, isBlocking: true });
    assert(dep.status === 201, 'dependency created', JSON.stringify(dep.body));
    const bDeps = await call(token, 'GET', `/tasks/${b.body.id}/dependencies`);
    assert(bDeps.status === 200 && bDeps.body.length === 1, 'successor lists one dependency');
    assert(bDeps.body[0]?.direction === 'WAITS_ON' && bDeps.body[0]?.task.id === a.body.id, 'successor WAITS_ON the predecessor');
    assert(/-\d+$/.test(bDeps.body[0]?.task.ref ?? ''), 'dependency carries a human task ref', bDeps.body[0]?.task.ref);
    const aDeps = await call(token, 'GET', `/tasks/${a.body.id}/dependencies`);
    assert(aDeps.body[0]?.direction === 'BLOCKS' && aDeps.body[0]?.task.id === b.body.id, 'predecessor BLOCKS the successor');
    const rm = await call(token, 'DELETE', `/tasks/dependencies/${dep.body.id}`);
    assert(rm.status === 200, 'dependency removed');
    const after = await call(token, 'GET', `/tasks/${b.body.id}/dependencies`);
    assert(after.body.length === 0, 'removed dependency no longer listed');

    // ---- deadline change needs a reason -------------------------------------
    const dated = await mk({ title: 'Dated task', dueDate: iso(Date.now() + 5 * DAY) });
    const first = iso(Date.now() + 5 * DAY);
    const noReason = await call(token, 'PATCH', `/tasks/${dated.body.id}`, { dueDate: iso(Date.now() + 9 * DAY) });
    assert(noReason.status === 400, 'moving an existing deadline without a reason is rejected', String(noReason.status));
    const withReason = await call(token, 'PATCH', `/tasks/${dated.body.id}`, { dueDate: iso(Date.now() + 9 * DAY), dueDateReason: 'Client asked for a later date' });
    assert(withReason.status === 200, 'moving a deadline with a reason succeeds', JSON.stringify(withReason.body));
    assert(withReason.body.originalDueDate && withReason.body.originalDueDate.slice(0, 10) === first.slice(0, 10), 'original commitment is retained');
    const history = await call(token, 'GET', `/tasks/${dated.body.id}/history`);
    const dueEntry = history.body.find((h) => h.action === 'DUE_DATE_CHANGED');
    assert(dueEntry?.afterValue?.reason === 'Client asked for a later date', 'reason is stored in the audit trail', JSON.stringify(dueEntry?.afterValue));
    const undated = await mk({ title: 'Undated task' });
    const setFirst = await call(token, 'PATCH', `/tasks/${undated.body.id}`, { dueDate: iso(Date.now() + 3 * DAY) });
    assert(setFirst.status === 200, 'setting a first deadline needs no reason');

    // ---- planning-hygiene filters -------------------------------------------
    const owned = await mk({ title: 'Has everything', ownerId: me.id, dueDate: iso(Date.now() + 4 * DAY), baselineEstimateMinutes: 30 });
    const bare = await mk({ title: 'Has nothing' });
    const overdue = await mk({ title: 'Late one', dueDate: iso(Date.now() - 2 * DAY), ownerId: me.id, baselineEstimateMinutes: 30 });
    const list = async (attention) => (await call(token, 'GET', `/workspaces/${workspace.id}/tasks?attention=${attention}&pageSize=100`)).body;
    const noOwner = await list('NO_OWNER');
    assert(noOwner.items.some((t) => t.id === bare.body.id) && !noOwner.items.some((t) => t.id === owned.body.id), 'NO_OWNER finds only ownerless tasks');
    const noDeadline = await list('NO_DEADLINE');
    assert(noDeadline.items.some((t) => t.id === bare.body.id) && !noDeadline.items.some((t) => t.id === owned.body.id), 'NO_DEADLINE finds only undated tasks');
    const noEstimate = await list('MISSING_ESTIMATE');
    assert(noEstimate.items.some((t) => t.id === bare.body.id) && !noEstimate.items.some((t) => t.id === owned.body.id), 'MISSING_ESTIMATE finds only unestimated tasks');
    const overdueList = await list('OVERDUE');
    assert(overdueList.items.some((t) => t.id === overdue.body.id) && !overdueList.items.some((t) => t.id === owned.body.id), 'OVERDUE finds only past-due open tasks');
    const blocker = await call(token, 'POST', `/tasks/${bare.body.id}/blockers`, { reason: 'Waiting on client assets', unblockerUserId: me.id });
    assert(blocker.status === 201, 'blocker recorded');
    const openBlockers = await call(token, 'GET', `/tasks/${bare.body.id}/blockers`);
    assert(openBlockers.status === 200 && openBlockers.body.length === 1 && openBlockers.body[0].unblockedAt === null, 'blocker list shows one open blocker');
    assert(openBlockers.body[0]?.unblocker?.id === me.id && openBlockers.body[0]?.reason === 'Waiting on client assets', 'blocker carries its reason and responsible unblocker');
    const blocked = await list('BLOCKED');
    assert(blocked.items.some((t) => t.id === bare.body.id) && blocked.items.length === 1, 'BLOCKED finds only tasks with an open blocker', String(blocked.items.length));
    const unblocked = await call(token, 'POST', `/tasks/blockers/${blocker.body.id}/unblock`, {});
    assert(unblocked.status === 201 || unblocked.status === 200, 'blocker can be marked unblocked');
    const closedBlockers = await call(token, 'GET', `/tasks/${bare.body.id}/blockers`);
    assert(closedBlockers.body[0]?.unblockedAt !== null, 'resolved blocker keeps its interval');
    const stillBlocked = await list('BLOCKED');
    assert(stillBlocked.items.length === 0, 'an unblocked task leaves the BLOCKED filter');
    const reblock = await call(token, 'POST', `/tasks/${bare.body.id}/blockers`, { reason: 'Waiting on client assets', unblockerUserId: me.id });
    assert(reblock.status === 201, 'task can be blocked again after unblocking');
    const reviewOverdue = await list('REVIEW_OVERDUE');
    assert(Array.isArray(reviewOverdue.items) && reviewOverdue.items.length === 0, 'REVIEW_OVERDUE is empty with nothing awaiting review');
    const badFilter = await call(token, 'GET', `/workspaces/${workspace.id}/tasks?attention=NOPE`);
    assert(badFilter.status === 400, 'unknown attention filter is rejected');

    // ---- attendance day states ----------------------------------------------
    const month = new Date().toISOString().slice(0, 7);
    const states = await call(token, 'GET', `/attendance/day-states?month=${month}`);
    assert(states.status === 200 && Array.isArray(states.body), 'day-states returns an array');
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    assert(states.body.length === daysInMonth, 'every day of the month is classified exactly once', `${states.body.length} vs ${daysInMonth}`);
    const weekendsOk = states.body.filter((d) => [0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay())).every((d) => d.state === 'WEEKLY_OFF' || d.state === 'HOLIDAY' || d.state === 'WORKED' || d.state === 'PENDING_CORRECTION');
    assert(weekendsOk, 'weekend days are Weekly off, never absence');
    const futureAbsence = states.body.filter((d) => d.date >= new Date().toISOString().slice(0, 10) && d.state === 'ABSENCE');
    assert(futureAbsence.length === 0, 'today and future days are never marked absent');
    const badMonth = await call(token, 'GET', '/attendance/day-states?month=2026-13');
    assert(badMonth.status === 400, 'invalid month is rejected');

    // ---- workspace state on the dashboard -----------------------------------
    const dash = await call(token, 'GET', '/admin/dashboard');
    assert(dash.status === 200, 'admin dashboard loads');
    const row = dash.body.workspacePerformance.find((w) => w.id === workspace.id);
    assert(Boolean(row), 'workspace appears in delivery state table');
    assert(['WEEKLY_OFF', 'BLOCKED', 'AWAITING_REVIEW', 'NO_ACTIVE_WORK', 'ACTIVE'].includes(row?.state), 'state is one of the actionable labels', String(row?.state));
    assert(typeof row?.openTasks === 'number' && row.blockedTasks >= 1, 'open and blocked counts are reported', JSON.stringify(row));
    const today = new Date().toISOString().slice(0, 10);
    const cal = await call(token, 'GET', '/calendar');
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const offToday = !cal.body.settings.workdays.includes(dow) || cal.body.exceptions.some((e) => e.date === today && e.kind === 'HOLIDAY');
    if (offToday) assert(row.state === 'WEEKLY_OFF', 'a non-working day shows Weekly off, not idle');
    else assert(row.state === 'BLOCKED', 'a workspace with an open blocker shows Blocked', String(row.state));

    // ---- enriched review queue ----------------------------------------------
    const rv = await mk({ title: 'Needs review', ownerId: me.id, dueDate: iso(Date.now() + 2 * DAY) });
    if (other) {
      const set = await call(token, 'PATCH', `/tasks/${rv.body.id}`, { reviewerId: other.id });
      assert(set.status === 200, 'reviewer assigned', `${set.status} ${JSON.stringify(set.body)}`);
    } else {
      console.log('SKIP review-queue assertions: no second active user available');
    }
    const link = await call(token, 'POST', `/tasks/${rv.body.id}/attachments/links`, { url: 'https://example.com/deliverable', title: 'Deliverable link' });
    assert(link.status === 201, 'evidence link attached', JSON.stringify(link.body));
    if (other) {
      const sub = await call(token, 'POST', `/tasks/${rv.body.id}/submissions`, { evidenceAttachmentId: link.body.id, note: 'Three layout options attached' });
      assert(sub.status === 201, 'submission created', JSON.stringify(sub.body));
      const queue = await call(token, 'GET', '/review-queue');
      const item = queue.body.find((q) => q.taskId === rv.body.id);
      assert(Boolean(item), 'submission appears in the review queue');
      assert(item?.deliveryNote === 'Three layout options attached', 'queue item carries the delivery note');
      assert(item?.evidence?.fileName === 'Deliverable link', 'queue item carries the frozen evidence', JSON.stringify(item?.evidence));
      assert(typeof item?.dueDate === 'string' && typeof item?.projectName === 'string', 'queue item carries deadline and project');
      assert(Array.isArray(item?.priorReturns) && item.priorReturns.length === 0, 'first submission has no prior returns');
      const ret = await call(token, 'POST', `/tasks/${rv.body.id}/submissions/${sub.body.id}/review`, { decision: 'RETURNED', note: 'Add a fourth option' });
      assert(ret.status === 201 || ret.status === 200, 'submission returned with reason', String(ret.status));
      const sub2 = await call(token, 'POST', `/tasks/${rv.body.id}/submissions`, { evidenceAttachmentId: link.body.id, note: 'Fourth option added' });
      const queue2 = await call(token, 'GET', '/review-queue');
      const item2 = queue2.body.find((q) => q.taskId === rv.body.id);
      assert(item2?.priorReturns?.[0]?.reason === 'Add a fourth option', 'resubmission shows the earlier return reason', JSON.stringify(item2?.priorReturns));
      void sub2;
    }

    // ---- forecast on list rows (AT08: 60 baseline, 45 actual, 30 remaining => 75) -----
    const fc = await mk({ title: 'Forecast task', ownerId: me.id, baselineEstimateMinutes: 60, remainingEstimateMinutes: 30 });
    const logged = await call(token, 'POST', `/tasks/${fc.body.id}/time-entries`, { workDate: new Date().toISOString().slice(0, 10), durationMinutes: 45, category: 'EXECUTION' });
    assert(logged.status === 201, '45 minutes logged', JSON.stringify(logged.body));
    // Logging time burns the remaining estimate down; the owner then states what is really left (spec: remaining is an owner forecast).
    await call(token, 'PATCH', `/tasks/${fc.body.id}`, { remainingEstimateMinutes: 30 });
    const fcList = (await call(token, 'GET', `/workspaces/${workspace.id}/tasks?pageSize=100`)).body.items.find((t) => t.id === fc.body.id);
    assert(fcList?.actualEffortMinutes === 45, 'list row reports 45 recorded minutes', String(fcList?.actualEffortMinutes));
    assert(fcList.actualEffortMinutes + fcList.remainingEstimateMinutes === 75, 'forecast is actual + remaining = 75');
    assert(fcList.actualEffortMinutes + fcList.remainingEstimateMinutes - fcList.baselineEstimateMinutes === 15, 'forecast overrun against the original is 15');

    // ---- an estimate-less subtask must not erase the parent's estimates ----------------
    const par = await mk({ title: 'Parent with its own estimate', ownerId: me.id, baselineEstimateMinutes: 150 });
    const kid = await call(token, 'POST', `/tasks/${par.body.id}/subtasks`, { title: 'Subtask with no estimate yet' });
    assert(kid.status === 201, 'subtask without an estimate created', JSON.stringify(kid.body));
    const parAfter = (await call(token, 'GET', `/tasks/${par.body.id}`)).body;
    assert(parAfter.baselineEstimateMinutes === 150 && parAfter.currentEstimateMinutes === 150 && parAfter.remainingEstimateMinutes === 150, 'the parent keeps its own estimates when its only subtask has none', `${parAfter.baselineEstimateMinutes}/${parAfter.currentEstimateMinutes}/${parAfter.remainingEstimateMinutes}`);

    // ---- project edit -------------------------------------------------------
    const renamed = await call(token, 'PATCH', `/projects/${project.id}`, { name: 'Renamed by smoke', color: '#10b981' });
    assert(renamed.status === 200 && renamed.body.name === 'Renamed by smoke' && renamed.body.color === '#10b981', 'admin can edit a project', JSON.stringify(renamed.body));
    const badColor = await call(token, 'PATCH', `/projects/${project.id}`, { color: 'red' });
    assert(badColor.status === 400, 'an invalid project colour is rejected');

    // ---- team availability --------------------------------------------------
    const monday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; })();
    const fromD = monday.toISOString().slice(0, 10);
    const toD = new Date(monday.getTime() + 6 * DAY).toISOString().slice(0, 10);
    const avail = await call(token, 'GET', `/attendance/team-availability?from=${fromD}&to=${toD}`);
    assert(avail.status === 200 && avail.body.dates.length === 7, 'team availability covers the 7 requested days', String(avail.status));
    assert(avail.body.people.length > 0 && avail.body.people.every((p) => p.days.length === 7), 'every person has one state per day');
    const access = await call(token, 'GET', '/attendance/team-availability/access');
    assert(access.status === 200 && access.body.allowed === true, 'an admin is allowed to view team availability');
    const tooLong = await call(token, 'GET', `/attendance/team-availability?from=2026-01-01&to=2026-06-01`);
    assert(tooLong.status === 400, 'a range over 31 days is rejected');
    const backwards = await call(token, 'GET', `/attendance/team-availability?from=${toD}&to=${fromD}`);
    assert(backwards.status === 400, 'a backwards range is rejected');

    // ---- member dashboard ---------------------------------------------------
    const mine = await call(token, 'GET', '/me/dashboard');
    assert(mine.status === 200 && typeof mine.body.reviewsWaiting === 'number' && typeof mine.body.blockedOnMe === 'number', 'member dashboard reports reviews waiting and blocked-on-me counts', JSON.stringify(Object.keys(mine.body)));
    assert(Array.isArray(mine.body.updateOverdueTaskIds), 'member dashboard lists update-overdue task ids');
    const dash2 = await call(token, 'GET', '/admin/dashboard');
    const row2 = dash2.body.workspacePerformance.find((w) => w.id === workspace.id);
    assert(typeof row2?.updateOverdueTasks === 'number', 'workspace row reports an update-overdue count');

    // ---- simplified review policy -------------------------------------------
    const pol = await call(token, 'GET', '/admin/organisation-policy');
    assert(pol.status === 200 && ['ALLOW', 'SMALL_ONLY', 'REQUIRE_REVIEWER'].includes(pol.body.noReviewerDonePolicy), 'policy exposes the no-reviewer rule', JSON.stringify(pol.body));
    const putPolicy = (patch) => call(token, 'PUT', '/admin/organisation-policy', {
      ...pol.body, earnedLeaveMonthly: Number(pol.body.earnedLeaveMonthly), casualLeaveMonthly: Number(pol.body.casualLeaveMonthly), ...patch,
    });
    try {
      const small = await mk({ title: 'Small no-reviewer task', baselineEstimateMinutes: 30 });
      const large = await mk({ title: 'Large no-reviewer task', baselineEstimateMinutes: 600 });
      const none = await mk({ title: 'Unestimated no-reviewer task' });
      let r = await putPolicy({ noReviewerDonePolicy: 'REQUIRE_REVIEWER' });
      assert(r.status === 200, 'policy set to REQUIRE_REVIEWER', JSON.stringify(r.body));
      r = await call(token, 'PATCH', `/tasks/${small.body.id}`, { status: 'DONE' });
      assert(r.status === 400, 'REQUIRE_REVIEWER blocks Done without a reviewer', String(r.status));
      r = await putPolicy({ noReviewerDonePolicy: 'SMALL_ONLY', simplifiedReviewMaxMinutes: 120 });
      assert(r.status === 200, 'policy set to SMALL_ONLY');
      r = await call(token, 'PATCH', `/tasks/${large.body.id}`, { status: 'DONE' });
      assert(r.status === 400, 'SMALL_ONLY blocks a task over the limit', String(r.status));
      r = await call(token, 'PATCH', `/tasks/${none.body.id}`, { status: 'DONE' });
      assert(r.status === 400, 'SMALL_ONLY blocks an unestimated task', String(r.status));
      r = await call(token, 'PATCH', `/tasks/${small.body.id}`, { status: 'DONE' });
      assert(r.status === 200, 'SMALL_ONLY allows a small task', JSON.stringify(r.body));
      r = await putPolicy({ noReviewerDonePolicy: 'ALLOW' });
      r = await call(token, 'PATCH', `/tasks/${large.body.id}`, { status: 'DONE' });
      assert(r.status === 200, 'ALLOW keeps the legacy behaviour', String(r.status));
    } finally {
      await putPolicy({ noReviewerDonePolicy: pol.body.noReviewerDonePolicy, simplifiedReviewMaxMinutes: pol.body.simplifiedReviewMaxMinutes });
    }
  } finally {
    await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: true }).catch(() => null);
  }

  if (failures > 0) { console.error(`${failures} assertion(s) failed`); process.exit(1); }
  console.log('Spec UI support smoke passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
