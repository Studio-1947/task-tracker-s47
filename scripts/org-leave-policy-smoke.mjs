#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers the organisation model (offices, clients, teams and their links to
// workspaces) and gender-applicable leave types. Fixtures are reused (find or
// create + reset password) so repeated runs do not accumulate users.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };

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

async function provision(adminToken, email, name, gender) {
  const list = await call(adminToken, 'GET', '/users');
  const existing = (Array.isArray(list.body) ? list.body : list.body?.items ?? []).find((u) => u.email === email);
  let userId; let tempPassword;
  if (existing) {
    userId = existing.id;
    const reset = await call(adminToken, 'POST', `/users/${userId}/reset-password`);
    tempPassword = reset.body?.tempPassword;
    if (existing.isActive === false) await call(adminToken, 'PATCH', `/users/${userId}`, { isActive: true });
    await call(adminToken, 'PATCH', `/users/${userId}`, { gender });
  } else {
    const created = await call(adminToken, 'POST', '/users', { name, email, role: 'MEMBER', gender });
    userId = created.body?.id; tempPassword = created.body?.tempPassword;
  }
  const login = await call(null, 'POST', '/auth/login', { email, password: tempPassword });
  assert(Boolean(login.body?.accessToken), `${email} can sign in`, String(login.status));
  return { id: userId, token: login.body.accessToken, user: login.body.user };
}

// First Monday at least `weeks` weeks out (a scheduled working day in the default calendar).
function futureMonday(weeks) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + weeks * 7); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

async function main() {
  const adminLogin = await call(null, 'POST', '/auth/login', ADMIN);
  const admin = adminLogin.body.accessToken;
  const stamp = Date.now();

  const male = await provision(admin, 'org-smoke-male@example.com', 'Org Smoke Male', 'MALE');
  const female = await provision(admin, 'org-smoke-female@example.com', 'Org Smoke Female', 'FEMALE');
  assert(male.user.gender === 'MALE' && female.user.gender === 'FEMALE', 'gender is stored and returned on the signed-in user', `${male.user.gender}/${female.user.gender}`);

  // ---- organisation directory ------------------------------------------------
  console.log('\n-- offices, clients, teams --');
  const officeName = `Org Smoke Office ${stamp}`;
  const office = await call(admin, 'POST', '/organisation/offices', { name: officeName, timezone: 'Asia/Kolkata' });
  assert(office.status === 201 && office.body.name === officeName, 'admin can create an office', JSON.stringify(office.body));
  const dupOffice = await call(admin, 'POST', '/organisation/offices', { name: officeName });
  assert(dupOffice.status >= 400 && dupOffice.status < 500, 'a duplicate office name is a client error, not a 500', String(dupOffice.status));
  const client = await call(admin, 'POST', '/organisation/clients', { name: `Org Smoke Client ${stamp}` });
  assert(client.status === 201, 'admin can create a client', JSON.stringify(client.body));
  const team = await call(admin, 'POST', '/organisation/teams', { name: `Org Smoke Team ${stamp}` });
  assert(team.status === 201, 'admin can create a team', JSON.stringify(team.body));
  const offices = await call(admin, 'GET', '/organisation/offices');
  assert(offices.body.some((o) => o.id === office.body.id), 'created office is listed');
  const badKind = await call(admin, 'GET', '/organisation/widgets');
  assert(badKind.status >= 400 && badKind.status < 500, 'an unknown directory kind is a client error, not a 500', String(badKind.status));

  const memberRead = await call(male.token, 'GET', '/organisation/offices');
  assert(memberRead.status === 403, 'a member cannot read the directory', String(memberRead.status));
  const memberWrite = await call(male.token, 'POST', '/organisation/offices', { name: `Nope ${stamp}` });
  assert(memberWrite.status === 403, 'a member cannot create an office', String(memberWrite.status));

  const setMembers = await call(admin, 'PUT', `/organisation/teams/${team.body.id}/members`, { userIds: [male.id, female.id] });
  assert(setMembers.status === 200, 'team membership can be set', JSON.stringify(setMembers.body));
  const members = await call(admin, 'GET', `/organisation/teams/${team.body.id}/members`);
  assert(members.body.length === 2 && members.body.includes(male.id), 'team members read back');
  const shrink = await call(admin, 'PUT', `/organisation/teams/${team.body.id}/members`, { userIds: [female.id] });
  const members2 = await call(admin, 'GET', `/organisation/teams/${team.body.id}/members`);
  assert(shrink.status === 200 && members2.body.length === 1 && members2.body[0] === female.id, 'setting members replaces the previous set');

  // ---- workspace context ---------------------------------------------------------
  console.log('\n-- workspace office / client / team context --');
  const ws = await call(admin, 'POST', '/workspaces', { name: `Org Smoke WS ${stamp}`, officeId: office.body.id, clientId: client.body.id });
  assert(ws.status === 201, 'workspace created with office and client', JSON.stringify(ws.body));
  try {
    assert(ws.body.officeId === office.body.id && ws.body.clientId === client.body.id, 'workspace returns its office and client');
    const cleared = await call(admin, 'PATCH', `/workspaces/${ws.body.id}`, { officeId: null });
    assert(cleared.status === 200 && cleared.body.officeId === null && cleared.body.clientId === client.body.id, 'office can be cleared without touching the client', JSON.stringify(cleared.body));
    const badOffice = await call(admin, 'PATCH', `/workspaces/${ws.body.id}`, { officeId: '00000000-0000-4000-8000-000000000000' });
    assert(badOffice.status >= 400 && badOffice.status < 500, 'a non-existent office id is a client error, not a 500', String(badOffice.status));
    const wst = await call(admin, 'PUT', `/organisation/workspaces/${ws.body.id}/teams`, { teamIds: [team.body.id] });
    assert(wst.status === 200, 'workspace teams can be set', JSON.stringify(wst.body));
    const wsTeams = await call(admin, 'GET', `/organisation/workspaces/${ws.body.id}/teams`);
    assert(wsTeams.body.length === 1 && wsTeams.body[0] === team.body.id, 'workspace teams read back');
  } finally {
    await call(admin, 'PATCH', `/workspaces/${ws.body.id}`, { isArchived: true }).catch(() => null);
  }

  // ---- gender-applicable leave -----------------------------------------------------
  console.log('\n-- gender-applicable leave types --');
  const typeName = `Org Smoke Female Only ${stamp}`;
  const lt = await call(admin, 'POST', '/leave-types', { name: typeName, defaultBalance: 10, applicableGender: 'FEMALE' });
  assert(lt.status === 201 && lt.body.applicableGender === 'FEMALE', 'a female-only leave type can be created', JSON.stringify(lt.body));
  try {
    const mBal = await call(male.token, 'GET', '/leaves/balances/me');
    const fBal = await call(female.token, 'GET', '/leaves/balances/me');
    assert(!mBal.body.some((b) => b.typeName === typeName), 'a man does not see the female-only balance');
    assert(fBal.body.some((b) => b.typeName === typeName), 'a woman sees the female-only balance');

    const monday = futureMonday(12);
    const mReq = await call(male.token, 'POST', '/leaves', { leaveTypeId: lt.body.id, startDate: monday, endDate: monday, halfDay: false, reason: 'smoke' });
    assert(mReq.status === 403, 'a man cannot request a female-only leave type', `${mReq.status} ${JSON.stringify(mReq.body)}`);
    const fReq = await call(female.token, 'POST', '/leaves', { leaveTypeId: lt.body.id, startDate: monday, endDate: monday, halfDay: false, reason: 'smoke' });
    assert(fReq.status === 201, 'a woman can request it', `${fReq.status} ${JSON.stringify(fReq.body)}`);
    if (fReq.status === 201) await call(female.token, 'POST', `/leaves/${fReq.body.id}/cancel`);

    // Gender gates which leave types apply: a member may set it once (while unspecified), only an admin changes it after.
    const selfEdit = await call(male.token, 'PATCH', '/me', { gender: 'FEMALE' });
    assert(selfEdit.status === 403, 'a member cannot change a gender that is already set', String(selfEdit.status));
    const selfSame = await call(male.token, 'PATCH', '/me', { gender: 'MALE', name: 'Org Smoke Male' });
    assert(selfSame.status === 200, 'a member can still save their profile with the same gender', String(selfSame.status));
    await call(admin, 'PATCH', `/users/${male.id}`, { gender: 'MALE' });
  } finally {
    await call(admin, 'DELETE', `/leave-types/${lt.body.id}`).catch(() => null);
  }

  // ---- approval semantics --------------------------------------------------------
  console.log('\n-- leave approval settings --');
  // Approved leave cannot be revoked, so every run books weeks after everything the fixture user already has. Random
  // weeks collide eventually (409); starting after the latest existing leave never does.
  const existingLeaves = (await call(male.token, 'GET', '/leaves/me')).body ?? [];
  const latestEnd = existingLeaves.reduce((m, l) => (l.endDate > m ? l.endDate : m), '1970-01-01');
  const weeksToLatest = Math.max(0, Math.ceil((new Date(`${latestEnd}T00:00:00Z`).getTime() - Date.now()) / (7 * 86400000)));
  const stampWeeks = Math.max(30, weeksToLatest + 2);
  const none = await call(admin, 'POST', '/leave-types', { name: `Org Smoke No Approval ${stamp}`, defaultBalance: 2, approvalRequired: 'NO_APPROVAL' });
  const prior = await call(admin, 'POST', '/leave-types', { name: `Org Smoke Prior ${stamp}`, defaultBalance: 5, approvalRequired: 'PRIOR_APPROVAL' });
  const manager = await call(admin, 'POST', '/leave-types', { name: `Org Smoke Manager ${stamp}`, defaultBalance: 5, approvalRequired: 'MANAGER_APPROVAL' });
  assert([none, prior, manager].every((r) => r.status === 201), 'three leave types with different approval rules created');
  try {
    const m1 = futureMonday(stampWeeks);
    const auto = await call(male.token, 'POST', '/leaves', { leaveTypeId: none.body.id, startDate: m1, endDate: m1, halfDay: false });
    assert(auto.status === 201 && auto.body.status === 'APPROVED', 'a no-approval type is approved automatically', `${auto.status} ${auto.body?.status}`);
    assert(Boolean(auto.body?.reviewedAt) && /automatic/i.test(auto.body?.reviewNote ?? ''), 'the automatic approval is recorded as such');
    const m2 = futureMonday(stampWeeks + 1);
    const m2end = new Date(`${m2}T00:00:00Z`); m2end.setUTCDate(m2end.getUTCDate() + 4);
    const over = await call(male.token, 'POST', '/leaves', { leaveTypeId: none.body.id, startDate: m2, endDate: m2end.toISOString().slice(0, 10), halfDay: false });
    assert(over.status === 400 && /balance/i.test(over.body?.message ?? ''), 'an automatic approval still respects the balance', `${over.status} ${over.body?.message}`);

    const today = new Date().toISOString().slice(0, 10);
    const late = await call(male.token, 'POST', '/leaves', { leaveTypeId: prior.body.id, startDate: today, endDate: today, halfDay: false });
    assert(late.status === 400, 'a prior-approval type cannot start today or earlier', String(late.status));
    const m3 = futureMonday(stampWeeks + 2);
    const ahead = await call(male.token, 'POST', '/leaves', { leaveTypeId: prior.body.id, startDate: m3, endDate: m3, halfDay: false });
    assert(ahead.status === 201 && ahead.body.status === 'PENDING', 'a prior-approval request made in advance waits for a decision', `${ahead.status} ${ahead.body?.status}`);
    if (ahead.status === 201) await call(male.token, 'POST', `/leaves/${ahead.body.id}/cancel`);

    const m4 = futureMonday(stampWeeks + 3);
    const mgr = await call(male.token, 'POST', '/leaves', { leaveTypeId: manager.body.id, startDate: m4, endDate: m4, halfDay: false });
    assert(mgr.status === 201 && mgr.body.status === 'PENDING', 'a manager-approval type stays pending', `${mgr.status} ${mgr.body?.status}`);
    if (mgr.status === 201) await call(male.token, 'POST', `/leaves/${mgr.body.id}/cancel`);
  } finally {
    for (const t of [none, prior, manager]) if (t.body?.id) await call(admin, 'DELETE', `/leave-types/${t.body.id}`).catch(() => null);
  }

  // ---- bulk holiday import ------------------------------------------------------
  console.log('\n-- bulk holiday import --');
  const d1 = '2031-03-03'; const d2 = '2031-03-04';
  const payload = (name) => ({ mode: 'ADD_ONLY', exceptions: [{ date: d1, name, kind: 'HOLIDAY' }, { date: d2, name: `${name} 2`, kind: 'HOLIDAY' }] });
  try {
    const first = await call(admin, 'POST', '/calendar/exceptions/bulk', payload('Smoke Holiday'));
    assert(first.status === 201 && first.body.imported === 2 && first.body.skipped === 0, 'bulk import adds new dates', JSON.stringify(first.body));
    const again = await call(admin, 'POST', '/calendar/exceptions/bulk', payload('Smoke Holiday'));
    assert(again.body.imported === 0 && again.body.skipped === 2 && again.body.conflicts.length === 2, 'ADD_ONLY re-import skips existing dates and reports them', JSON.stringify(again.body));
    const replaced = await call(admin, 'POST', '/calendar/exceptions/bulk', { ...payload('Renamed Holiday'), mode: 'REPLACE_MATCHING' });
    assert(replaced.body.imported === 2, 'REPLACE_MATCHING updates existing dates', JSON.stringify(replaced.body));
    const cal = await call(admin, 'GET', '/calendar');
    assert(cal.body.exceptions.find((e) => e.date === d1)?.name === 'Renamed Holiday', 'the replaced name is stored');
    const dup = await call(admin, 'POST', '/calendar/exceptions/bulk', { mode: 'ADD_ONLY', exceptions: [{ date: d1, name: 'a', kind: 'HOLIDAY' }, { date: d1, name: 'b', kind: 'HOLIDAY' }] });
    assert(dup.status === 400, 'a payload with the same date twice is rejected', String(dup.status));
    const empty = await call(admin, 'POST', '/calendar/exceptions/bulk', { mode: 'ADD_ONLY', exceptions: [] });
    assert(empty.status === 400, 'an empty import is rejected');
    const denied = await call(male.token, 'POST', '/calendar/exceptions/bulk', payload('Nope'));
    assert(denied.status === 403, 'a member cannot import holidays', String(denied.status));
  } finally {
    const cal = await call(admin, 'GET', '/calendar');
    for (const e of cal.body.exceptions.filter((x) => x.date === d1 || x.date === d2)) await call(admin, 'DELETE', `/calendar/exceptions/${e.id}`);
  }

  if (failures > 0) { console.error(`${failures} assertion(s) failed`); process.exit(1); }
  console.log('Organisation and leave policy smoke passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
