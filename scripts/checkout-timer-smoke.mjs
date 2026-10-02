#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Spec §6: checking out while a task timer runs must prompt, and attendance hours never become task time.
// A user can check out once per day, so the final "STOP" step runs only on the first run of each day (reported, not hidden).

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
};
const MEMBER_EMAIL = 'checkout-timer-smoke@example.com';
const WS_NAME = 'Checkout Timer Smoke';

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

async function main() {
  const admin = (await call(null, 'POST', '/auth/login', ADMIN)).body;
  assert(Boolean(admin?.accessToken), 'admin login');
  const at = admin.accessToken;

  // Reusable fixture member (find-or-create, new temp password each run).
  const users = (await call(at, 'GET', '/users')).body ?? [];
  let member = users.find((u) => u.email === MEMBER_EMAIL);
  let tempPassword;
  if (member) {
    tempPassword = (await call(at, 'POST', `/users/${member.id}/reset-password`)).body?.tempPassword;
  } else {
    const created = (await call(at, 'POST', '/users', { name: 'Checkout Timer Smoke', email: MEMBER_EMAIL, role: 'MEMBER' })).body;
    member = created;
    tempPassword = created?.tempPassword;
  }
  const mLogin = (await call(null, 'POST', '/auth/login', { email: MEMBER_EMAIL, password: tempPassword })).body;
  assert(Boolean(mLogin?.accessToken), 'fixture member login');
  const mt = mLogin.accessToken;

  // Reusable workspace with the member in it.
  const workspaces = (await call(at, 'GET', '/workspaces')).body ?? [];
  let ws = workspaces.find((w) => w.name === WS_NAME);
  if (!ws) ws = (await call(at, 'POST', '/workspaces', { name: WS_NAME })).body;
  await call(at, 'POST', `/workspaces/${ws.id}/members`, { add: [member.id] });
  const project = (await call(at, 'GET', `/workspaces/${ws.id}/projects`)).body?.[0];
  assert(Boolean(project), 'workspace has a project');

  const taskRes = await call(at, 'POST', `/workspaces/${ws.id}/tasks`, {
    projectId: project.id,
    title: `Checkout timer task ${Date.now()}`,
    ownerId: member.id,
  });
  assert(taskRes.status === 201, 'task created', JSON.stringify(taskRes.body));
  const task = taskRes.body;

  // Clear any timer left by a crashed earlier run.
  const pre = (await call(mt, 'GET', '/attendance/today')).body;
  if (pre?.runningTimer) await call(mt, 'POST', `/tasks/${pre.runningTimer.taskId}/timer/stop`);

  let today = (await call(mt, 'GET', '/attendance/today')).body;
  assert(today.runningTimer === null, 'no running timer reported when none is running');
  if (!today.checkedIn) {
    const inRes = await call(mt, 'POST', '/attendance/check-in', {});
    assert(inRes.status === 201, 'checked in', JSON.stringify(inRes.body));
  }
  today = (await call(mt, 'GET', '/attendance/today')).body;

  if (today.checkedOut) {
    console.log('SKIP checkout assertions: this fixture already checked out today (run again tomorrow, or after a fixture reset)');
  } else {
    const start = await call(mt, 'POST', `/tasks/${task.id}/timer/start`, { category: 'EXECUTION' });
    assert(start.status === 201, 'timer started', JSON.stringify(start.body));

    today = (await call(mt, 'GET', '/attendance/today')).body;
    assert(today.runningTimer?.taskId === task.id, 'attendance/today reports the running timer');

    const blocked = await call(mt, 'POST', '/attendance/check-out', {});
    assert(blocked.status === 409, 'check-out without a timer decision is refused', String(blocked.status));
    today = (await call(mt, 'GET', '/attendance/today')).body;
    assert(today.checkedOut === false, 'refused check-out recorded nothing');
    assert(today.runningTimer?.taskId === task.id, 'refused check-out left the timer running');

    const bad = await call(mt, 'POST', '/attendance/check-out', { timerAction: 'MAYBE' });
    assert(bad.status === 400, 'unknown timerAction rejected', String(bad.status));

    const out = await call(mt, 'POST', '/attendance/check-out', { timerAction: 'STOP' });
    assert(out.status === 201, 'check-out with STOP succeeds', JSON.stringify(out.body));
    today = (await call(mt, 'GET', '/attendance/today')).body;
    assert(today.checkedOut === true, 'checked out');
    assert(today.runningTimer === null, 'STOP ended the timer');

    const time = (await call(mt, 'GET', `/tasks/${task.id}/time-entries`)).body;
    assert(time.actualEffortMinutes <= 1, 'task effort is the timer span only, not the attendance interval', String(time.actualEffortMinutes));
  }

  if (failures) throw new Error(`${failures} checkout-timer smoke assertion(s) failed`);
  console.log('Checkout timer smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
