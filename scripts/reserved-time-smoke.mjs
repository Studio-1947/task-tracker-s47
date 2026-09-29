#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers reserved time (meetings/training) reducing weekly capacity, no
// double-counting of overlaps, and unallocated-work visibility.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };
const MEMBER_EMAIL = 'reserved.smoke.member@example.com';

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

// Reused fixture: an account that has acted can never be hard-deleted, so find-or-create and reset.
async function provisionMember(adminToken) {
  const users = (await call(adminToken, 'GET', '/users')).body;
  const existing = (Array.isArray(users) ? users : users?.items ?? []).find((u) => u.email === MEMBER_EMAIL);
  let tempPassword;
  if (existing) tempPassword = (await call(adminToken, 'POST', `/users/${existing.id}/reset-password`)).body?.tempPassword;
  else tempPassword = (await call(adminToken, 'POST', '/users', { name: 'Reserved Smoke Member', email: MEMBER_EMAIL, role: 'MEMBER' })).body?.tempPassword;
  const loggedIn = await login({ email: MEMBER_EMAIL, password: tempPassword });
  assert(loggedIn.user.role === 'MEMBER', 'fixture user is a non-admin MEMBER');
  return loggedIn;
}

async function main() {
  const admin = await login(ADMIN);
  const other = await provisionMember(admin.accessToken);
  const t = admin.accessToken;
  const created = [];
  const ws = await call(t, 'POST', '/workspaces', { name: `Reserved Time Smoke ${Date.now()}` });
  assert(ws.status === 201, 'workspace created', JSON.stringify(ws.body));
  try {
    await call(t, 'POST', `/workspaces/${ws.body.id}/members`, { add: [admin.user.id, other.user.id] });
    const period = '?periodStart=2026-10-05&periodEnd=2026-10-11';
    const weekly = async () => (await call(t, 'GET', `/workspaces/${ws.body.id}/capacity-allocations/weekly${period}`)).body.find((r) => r.user.id === other.user.id);
    const base = await weekly();
    assert(base && base.reservedMinutes === 0 && base.leaveMinutes === 0, 'baseline has no reserved or leave time', JSON.stringify(base));

    // Tuesday 2026-10-06 11:30-12:30 IST
    const win = { startsAt: '2026-10-06T06:00:00.000Z', endsAt: '2026-10-06T07:00:00.000Z' };
    const r1 = await call(other.accessToken, 'POST', '/reserved-time', { kind: 'MEETING', title: 'Smoke stand-up', ...win });
    assert(r1.status === 201, 'reservation created', JSON.stringify(r1.body));
    created.push(r1.body.id);
    const w1 = await weekly();
    assert(w1.reservedMinutes > 0 && w1.availableMinutes === base.availableMinutes - w1.reservedMinutes, 'reserved meeting reduces available capacity by exactly its working minutes', JSON.stringify(w1));

    const r2 = await call(other.accessToken, 'POST', '/reserved-time', { kind: 'TRAINING', title: 'Overlapping training', ...win });
    created.push(r2.body.id);
    const w2 = await weekly();
    assert(w2.reservedMinutes === w1.reservedMinutes && w2.availableMinutes === w1.availableMinutes, 'overlapping reservation is not double-counted', JSON.stringify(w2));

    // Saturday 2026-10-10: outside the working week, must not reduce capacity
    const r3 = await call(other.accessToken, 'POST', '/reserved-time', { kind: 'OTHER', title: 'Weekend thing', startsAt: '2026-10-10T06:00:00.000Z', endsAt: '2026-10-10T08:00:00.000Z' });
    created.push(r3.body.id);
    const w3 = await weekly();
    assert(w3.availableMinutes === w1.availableMinutes, 'non-working time does not reduce capacity', JSON.stringify(w3));

    const bad = await call(other.accessToken, 'POST', '/reserved-time', { title: 'Backwards', startsAt: win.endsAt, endsAt: win.startsAt });
    assert(bad.status === 400, 'end before start is rejected', String(bad.status));
    const forOther = await call(other.accessToken, 'POST', '/reserved-time', { userId: admin.user.id, title: 'Sneaky', ...win });
    assert(forOther.status === 403, 'cannot reserve time for someone else (non-admin)', String(forOther.status));
    const peek = await call(other.accessToken, 'GET', `/reserved-time?userId=${admin.user.id}`);
    assert(peek.status === 403, 'cannot list another person reservations (non-admin)', String(peek.status));
    const delOwn = await call(other.accessToken, 'DELETE', `/reserved-time/${created[0]}`);
    assert(delOwn.status === 200, 'owner can remove own reservation', String(delOwn.status));
    const w4 = await weekly();
    assert(w4.reservedMinutes === w1.reservedMinutes, 'overlapping twin still holds the slot after removing one', JSON.stringify(w4));
    for (const id of created.slice(1)) await call(other.accessToken, 'DELETE', `/reserved-time/${id}`);
    created.length = 0;
    const w5 = await weekly();
    assert(w5.availableMinutes === base.availableMinutes && w5.reservedMinutes === 0, 'capacity returns to baseline once reservations are removed', JSON.stringify(w5));

    // Unallocated-work visibility
    const projects = await call(t, 'GET', `/workspaces/${ws.body.id}/projects`);
    const task = await call(t, 'POST', `/workspaces/${ws.body.id}/tasks`, { projectId: projects.body[0].id, title: 'Unplanned effort', baselineEstimateMinutes: 120, currentEstimateMinutes: 120, remainingEstimateMinutes: 120 });
    const u1 = await call(t, 'GET', `/workspaces/${ws.body.id}/capacity-allocations/unallocated`);
    const item1 = u1.body?.find?.((x) => x.taskId === task.body.id);
    assert(u1.status === 200 && item1?.unallocatedMinutes === 120 && item1.assigneeCount === 0, 'unplanned task shows full remaining effort as unallocated and no assignee', JSON.stringify(u1.body));
    await call(t, 'POST', `/workspaces/${ws.body.id}/capacity-allocations`, { userId: other.user.id, taskId: task.body.id, periodStart: '2026-10-05', periodEnd: '2026-10-09', allocatedMinutes: 45 });
    const u2 = await call(t, 'GET', `/workspaces/${ws.body.id}/capacity-allocations/unallocated`);
    assert(u2.body.find((x) => x.taskId === task.body.id)?.unallocatedMinutes === 75, 'allocation reduces unallocated minutes to 75', JSON.stringify(u2.body));
    await call(t, 'POST', `/workspaces/${ws.body.id}/capacity-allocations`, { userId: other.user.id, taskId: task.body.id, periodStart: '2026-10-05', periodEnd: '2026-10-09', allocatedMinutes: 75 });
    await call(t, 'PATCH', `/tasks/${task.body.id}`, { assigneeIds: [other.user.id] });
    const u3 = await call(t, 'GET', `/workspaces/${ws.body.id}/capacity-allocations/unallocated`);
    assert(!u3.body.some((x) => x.taskId === task.body.id), 'fully planned and assigned task leaves the unallocated list', JSON.stringify(u3.body));
    const asMember = await call(other.accessToken, 'GET', `/workspaces/${ws.body.id}/capacity-allocations/unallocated`);
    assert(asMember.status === 200, 'workspace member can read unallocated work', String(asMember.status));
  } finally {
    for (const id of created) await call(other.accessToken, 'DELETE', `/reserved-time/${id}`);
    if (ws.body?.id) await call(t, 'PATCH', `/workspaces/${ws.body.id}`, { isArchived: true });
  }
  if (failures) throw new Error(`${failures} reserved-time smoke assertion(s) failed`);
  console.log('Reserved time smoke passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
