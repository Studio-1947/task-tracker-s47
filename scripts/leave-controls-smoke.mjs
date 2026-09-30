#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers leave balance accrual/carry-forward fields, refusing approval beyond
// the balance, and the staffing-clash control with an explained override.
// Uses random far-future dates and reused fixtures so re-runs never collide.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };
const ADMIN2 = { email: process.env.SEED_ADMIN2_EMAIL ?? 'admin2@example.com', password: process.env.SEED_ADMIN2_PASSWORD ?? 'admin2_12345' };
const MEMBER_EMAIL = 'leave.controls.smoke@example.com';
const LIMITED = 'Controls Smoke Limited';
const UNLIMITED = 'Controls Smoke Unlimited';

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
const ymd = (d) => d.toISOString().slice(0, 10);

/** A random Monday between 2036 and 2046 — far outside any real data. */
function randomMonday() {
  const d = new Date(Date.UTC(2036 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27)));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d;
}
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

async function provisionMember(adminToken) {
  const users = (await call(adminToken, 'GET', '/users')).body;
  const existing = (Array.isArray(users) ? users : users?.items ?? []).find((u) => u.email === MEMBER_EMAIL);
  const tempPassword = existing
    ? (await call(adminToken, 'POST', `/users/${existing.id}/reset-password`)).body?.tempPassword
    : (await call(adminToken, 'POST', '/users', { name: 'Leave Controls Member', email: MEMBER_EMAIL, role: 'MEMBER' })).body?.tempPassword;
  return login({ email: MEMBER_EMAIL, password: tempPassword });
}

async function ensureType(t, name, patch) {
  const all = (await call(t, 'GET', '/leave-types?includeInactive=true')).body ?? [];
  const found = all.find((x) => x.name === name);
  if (found) return (await call(t, 'PATCH', `/leave-types/${found.id}`, { ...patch, isActive: true })).body;
  return (await call(t, 'POST', '/leave-types', { name, ...patch })).body;
}

async function main() {
  const admin = await login(ADMIN);
  const admin2 = await login(ADMIN2);
  const member = await provisionMember(admin.accessToken);
  const t = admin.accessToken;
  const pending = [];

  const policyRes = await call(t, 'GET', '/admin/organisation-policy');
  const original = policyRes.body;
  const putPolicy = (maxConcurrentLeavePercent) => call(t, 'PUT', '/admin/organisation-policy', {
    timezone: original.timezone,
    reminderChannels: original.reminderChannels,
    reminderRecipients: original.reminderRecipients,
    deadlineLeadMinutes: original.deadlineLeadMinutes,
    reviewTargetMinutes: original.reviewTargetMinutes,
    updateThresholdMinutes: original.updateThresholdMinutes,
    earnedLeaveMonthly: Number(original.earnedLeaveMonthly),
    casualLeaveMonthly: Number(original.casualLeaveMonthly),
    paidLeaveNames: original.paidLeaveNames,
    halfDayEnabled: original.halfDayEnabled,
    lateGraceMinutes: original.lateGraceMinutes,
    unresolvedCorrectionTreatment: original.unresolvedCorrectionTreatment,
    maxConcurrentLeavePercent,
    effectiveFrom: original.effectiveFrom,
  });

  const ws = await call(t, 'POST', '/workspaces', { name: `Leave Controls Smoke ${Date.now()}` });
  assert(ws.status === 201, 'workspace created', JSON.stringify(ws.body));
  try {
    await call(t, 'POST', `/workspaces/${ws.body.id}/members`, { add: [admin.user.id, admin2.user.id, member.user.id] });

    // ── accrual / carry-forward fields
    const limited = await ensureType(t, LIMITED, { defaultBalance: 0, accrualPerMonth: 1, carryForwardMax: 2, carryForwardExpiryMonths: 3 });
    assert(limited?.accrualPerMonth === 1 && limited.carryForwardMax === 2 && limited.carryForwardExpiryMonths === 3, 'leave type stores accrual, carry-forward cap and expiry', JSON.stringify(limited));
    const bal = (await call(member.accessToken, 'GET', '/leaves/balances/me')).body?.find?.((b) => b.leaveTypeId === limited.id);
    const firstOfNext = (() => { const n = new Date(); return ymd(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1))); })();
    assert(bal && bal.allotted >= 1 && typeof bal.carriedForward === 'number' && typeof bal.expired === 'number', 'balance reports accrued, carried-forward and expired days', JSON.stringify(bal));
    assert(bal?.nextAccrualOn === firstOfNext, 'next accrual date is the 1st of next month', JSON.stringify(bal));

    // ── over-balance approval refused, within-balance approved (fixed grant = used + 1)
    const start = randomMonday();
    // Used days are per leave year, so size the fixed grant from the balance in the year we will book into.
    const used = (await call(member.accessToken, 'GET', `/leaves/balances/me?asOf=${ymd(start)}`)).body.find((b) => b.leaveTypeId === limited.id).used;
    await ensureType(t, LIMITED, { defaultBalance: Math.ceil(used) + 1, accrualPerMonth: 0, carryForwardMax: 0, carryForwardExpiryMonths: null });
    const two = await call(member.accessToken, 'POST', '/leaves', { leaveTypeId: limited.id, startDate: ymd(start), endDate: ymd(addDays(start, 1)), halfDay: false, reason: 'Too long' });
    assert(two.status === 201, 'two-day request created', JSON.stringify(two.body));
    pending.push(two.body.id);
    const rejected = await call(t, 'POST', `/leaves/${two.body.id}/review`, { status: 'APPROVED' });
    assert(rejected.status === 400 && /Insufficient/.test(JSON.stringify(rejected.body)), 'approval beyond the remaining balance is refused', JSON.stringify(rejected.body));
    await call(t, 'POST', `/leaves/${two.body.id}/review`, { status: 'DECLINED', note: 'smoke cleanup' });

    const one = await call(member.accessToken, 'POST', '/leaves', { leaveTypeId: limited.id, startDate: ymd(start), endDate: ymd(start), halfDay: false });
    pending.push(one.body.id);
    const approved = await call(t, 'POST', `/leaves/${one.body.id}/review`, { status: 'APPROVED' });
    assert(approved.status === 201 || approved.status === 200, 'approval within the balance succeeds', JSON.stringify(approved.body));
    const after = (await call(member.accessToken, 'GET', `/leaves/balances/me?asOf=${ymd(start)}`)).body.find((b) => b.leaveTypeId === limited.id);
    assert(after.used === used + 1 && after.remaining === 0, 'balance shows the day used and none remaining', JSON.stringify(after));

    // ── staffing clash
    const unlimited = await ensureType(t, UNLIMITED, { defaultBalance: 0, accrualPerMonth: 0, carryForwardMax: 0, carryForwardExpiryMonths: null });
    const clashDay = ymd(addDays(randomMonday(), 0));
    const p40 = await putPolicy(40);
    assert(p40.status === 200 && p40.body.maxConcurrentLeavePercent === 40, 'staffing limit set to 40 percent', JSON.stringify(p40.body));
    const a2 = await call(admin2.accessToken, 'POST', '/leaves', { leaveTypeId: unlimited.id, startDate: clashDay, endDate: clashDay, halfDay: false });
    pending.push(a2.body.id);
    const a2ok = await call(t, 'POST', `/leaves/${a2.body.id}/review`, { status: 'APPROVED', overrideStaffingClash: true, note: 'smoke setup' });
    assert(a2ok.status === 201 || a2ok.status === 200, 'first colleague leave approved (override in case other teams are small)', JSON.stringify(a2ok.body));

    const mine = await call(member.accessToken, 'POST', '/leaves', { leaveTypeId: unlimited.id, startDate: clashDay, endDate: clashDay, halfDay: false });
    pending.push(mine.body.id);
    const warn = mine.body?.staffingWarnings?.find?.((w) => w.workspaceId === ws.body.id);
    assert(mine.status === 201 && warn && warn.date === clashDay && warn.onLeave === 1 && warn.members === 3, 'new request is flagged with a staffing warning', JSON.stringify(mine.body?.staffingWarnings));
    const blocked = await call(t, 'POST', `/leaves/${mine.body.id}/review`, { status: 'APPROVED' });
    assert(blocked.status === 409, 'approval is blocked by the staffing clash', JSON.stringify(blocked.body));
    const noNote = await call(t, 'POST', `/leaves/${mine.body.id}/review`, { status: 'APPROVED', overrideStaffingClash: true });
    assert(noNote.status === 400, 'an override without a note is refused', JSON.stringify(noNote.body));
    const withNote = await call(t, 'POST', `/leaves/${mine.body.id}/review`, { status: 'APPROVED', overrideStaffingClash: true, note: 'Covered by contractor' });
    assert(withNote.status === 201 || withNote.status === 200, 'an explained override approves the request', JSON.stringify(withNote.body));
    const declined = await call(t, 'GET', '/leaves?status=PENDING');
    assert(!declined.body?.some?.((l) => l.id === mine.body.id), 'approved request leaves the pending list');
  } finally {
    // Leave no pending request behind (declined requests never clash with later runs).
    for (const id of pending) await call(t, 'POST', `/leaves/${id}/review`, { status: 'DECLINED', note: 'smoke cleanup' });
    await call(t, 'PUT', '/admin/organisation-policy', {
      timezone: original.timezone, reminderChannels: original.reminderChannels, reminderRecipients: original.reminderRecipients,
      deadlineLeadMinutes: original.deadlineLeadMinutes, reviewTargetMinutes: original.reviewTargetMinutes,
      updateThresholdMinutes: original.updateThresholdMinutes, earnedLeaveMonthly: Number(original.earnedLeaveMonthly),
      casualLeaveMonthly: Number(original.casualLeaveMonthly), paidLeaveNames: original.paidLeaveNames,
      halfDayEnabled: original.halfDayEnabled, lateGraceMinutes: original.lateGraceMinutes,
      unresolvedCorrectionTreatment: original.unresolvedCorrectionTreatment,
      maxConcurrentLeavePercent: original.maxConcurrentLeavePercent ?? 100, effectiveFrom: original.effectiveFrom,
    });
    if (ws.body?.id) await call(t, 'PATCH', `/workspaces/${ws.body.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} leave-controls smoke assertion(s) failed`);
  console.log('Leave controls smoke passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
