#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers the update-overdue reminder: an in-progress task with no real update
// for the configured eligible working time notifies its owner once, and a real
// update (a comment) resets the clock. Needs the office to be inside working
// hours; outside them the worker correctly sends nothing and the test says so.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };
const OWNER = { email: process.env.SEED_ADMIN2_EMAIL ?? 'admin2@example.com', password: process.env.SEED_ADMIN2_PASSWORD ?? 'admin2_12345' };

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
async function login(a) {
  const r = await call(null, 'POST', '/auth/login', a);
  if (!r.body?.accessToken) throw new Error(`Login failed for ${a.email}`);
  return r.body;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const admin = await login(ADMIN);
  const owner = await login(OWNER);
  const t = admin.accessToken;

  const policyRes = await call(t, 'GET', '/admin/organisation-policy');
  assert(policyRes.status === 200, 'organisation policy readable', JSON.stringify(policyRes.body));
  const original = policyRes.body;
  const putPolicy = (updateThresholdMinutes) => call(t, 'PUT', '/admin/organisation-policy', {
    timezone: original.timezone,
    reminderChannels: original.reminderChannels,
    reminderRecipients: original.reminderRecipients,
    deadlineLeadMinutes: original.deadlineLeadMinutes,
    reviewTargetMinutes: original.reviewTargetMinutes,
    updateThresholdMinutes,
    earnedLeaveMonthly: Number(original.earnedLeaveMonthly),
    casualLeaveMonthly: Number(original.casualLeaveMonthly),
    paidLeaveNames: original.paidLeaveNames,
    halfDayEnabled: original.halfDayEnabled,
    lateGraceMinutes: original.lateGraceMinutes,
    unresolvedCorrectionTreatment: original.unresolvedCorrectionTreatment,
    effectiveFrom: original.effectiveFrom,
  });

  const ws = await call(t, 'POST', '/workspaces', { name: `Update Overdue Smoke ${Date.now()}` });
  assert(ws.status === 201, 'workspace created', JSON.stringify(ws.body));
  try {
    await call(t, 'POST', `/workspaces/${ws.body.id}/members`, { add: [admin.user.id, owner.user.id] });
    const projects = await call(t, 'GET', `/workspaces/${ws.body.id}/projects`);
    const task = await call(t, 'POST', `/workspaces/${ws.body.id}/tasks`, {
      projectId: projects.body[0].id, title: 'Silent in-progress task', status: 'IN_PROGRESS', ownerId: owner.user.id,
    });
    assert(task.status === 201, 'in-progress task created', JSON.stringify(task.body));

    const low = await putPolicy(1);
    assert(low.status === 200, 'threshold lowered to 1 working minute for the test', JSON.stringify(low.body));

    // Not yet stale: nothing to send for this task on the very first pass.
    const early = await call(t, 'POST', '/reminders/dispatch', {});
    assert(early.status === 201 && typeof early.body.workingHours === 'boolean' && early.body.byType, 'dispatch reports working-hours state and per-type counts', JSON.stringify(early.body));

    if (!early.body.workingHours) {
      console.log('SKIP outside working hours: the worker correctly sent nothing; stale-task assertions need in-hours run');
    } else {
      await sleep(65_000);
      const notifsFor = async () => (await call(owner.accessToken, 'GET', '/notifications?pageSize=100')).body?.items?.filter((n) => n.type === 'UPDATE_OVERDUE' && n.data?.taskId === task.body.id) ?? [];
      const first = await call(t, 'POST', '/reminders/dispatch', {});
      const n1 = await notifsFor();
      assert(first.body.byType?.UPDATE_OVERDUE >= 1 && n1.length === 1, 'owner is notified once about the silent task', JSON.stringify({ first: first.body, n1: n1.length }));
      await call(t, 'POST', '/reminders/dispatch', {});
      const n2 = await notifsFor();
      assert(n2.length === 1, 'repeated dispatch does not send a duplicate (idempotent)', String(n2.length));

      // A real update (a comment) resets the clock: stale again only after another eligible minute.
      await call(owner.accessToken, 'POST', `/tasks/${task.body.id}/comments`, { body: 'Progress: drafted the outline' });
      await call(t, 'POST', '/reminders/dispatch', {});
      const n3 = await notifsFor();
      assert(n3.length === 1, 'a fresh comment resets the clock (no new reminder immediately)', String(n3.length));
      await sleep(65_000);
      await call(t, 'POST', '/reminders/dispatch', {});
      const n4 = await notifsFor();
      assert(n4.length === 2, 'a new stale stretch produces one new reminder', String(n4.length));

      // Waiting on a blocker is not an update the owner can give.
      const blocker = await call(t, 'POST', `/tasks/${task.body.id}/blockers`, { reason: 'Waiting on vendor', unblockerUserId: admin.user.id });
      assert(blocker.status === 201, 'blocker recorded', JSON.stringify(blocker.body));
      await sleep(65_000);
      await call(t, 'POST', '/reminders/dispatch', {});
      const n5 = await notifsFor();
      assert(n5.length === 2, 'a blocked task is not chased for updates', String(n5.length));
    }
  } finally {
    await putPolicy(original.updateThresholdMinutes);
    if (ws.body?.id) await call(t, 'PATCH', `/workspaces/${ws.body.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} update-overdue smoke assertion(s) failed`);
  console.log('Update overdue smoke passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
