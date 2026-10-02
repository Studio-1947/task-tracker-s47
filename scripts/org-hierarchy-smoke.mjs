#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers the people reporting tree (CEO -> managers -> staff): admin can change anything, a manager only their own
// subtree and the teams they lead, everyone else is read-only. Fixtures are reused and reset (accounts and teams cannot be deleted).

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
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text }; }
  return { status: res.status, body: parsed };
}
async function provision(at, key, name) {
  const email = `org-hier-${key}@example.com`;
  const list = (await call(at, 'GET', '/users')).body ?? [];
  let u = list.find((x) => x.email === email);
  let temp;
  if (u) temp = (await call(at, 'POST', `/users/${u.id}/reset-password`)).body?.tempPassword;
  else { u = (await call(at, 'POST', '/users', { name, email, role: 'MEMBER' })).body; temp = u?.tempPassword; }
  const token = (await call(null, 'POST', '/auth/login', { email, password: temp })).body?.accessToken;
  assert(Boolean(token), `${name} can sign in`);
  return { id: u.id, token };
}
const move = (t, id, body) => call(t, 'PATCH', `/org-tree/people/${id}`, body);
const off = (t, id) => call(t, 'DELETE', `/org-tree/people/${id}`);

async function main() {
  const login = (await call(null, 'POST', '/auth/login', ADMIN)).body;
  const at = login.accessToken; const boss = login.user.id;
  const mgr = await provision(at, 'mgr', 'Hier Manager');
  const e1 = await provision(at, 'e1', 'Hier Staff One');
  const e2 = await provision(at, 'e2', 'Hier Staff Two');
  const out = await provision(at, 'out', 'Hier Outsider');
  const hire0 = ((await call(at, 'GET', '/users')).body ?? []).find((x) => x.email === 'org-hier-new@example.com');
  for (const u of [...(hire0 ? [hire0] : []), e1, e2, out, mgr, { id: boss }]) await off(at, u.id);

  // ---- admin builds the chart ----
  assert((await move(at, mgr.id, { reportsToId: boss })).status === 200, 'admin puts a manager under the CEO');
  assert((await move(at, e1.id, { reportsToId: mgr.id })).status === 200, 'admin puts staff under the manager');
  assert((await move(at, e2.id, { reportsToId: mgr.id })).status === 200, 'admin puts more staff under the manager');
  assert((await move(at, boss, { reportsToId: e1.id })).status === 400, 'a loop (CEO under their own report) is refused');
  assert((await move(at, mgr.id, { reportsToId: mgr.id })).status === 400, 'nobody can report to themselves');
  assert((await move(at, mgr.id, { reportsToId: '00000000-0000-4000-8000-000000000000' })).status === 400, 'an unknown manager is refused');

  const adminTree = (await call(at, 'GET', '/org-tree')).body;
  assert(adminTree.permissions.level === 'ADMIN' && adminTree.permissions.canCreatePeople === true && adminTree.permissions.canPlaceTopLevel === true, 'admin tree carries full permissions');
  assert(adminTree.people.find((p) => p.id === e1.id)?.reportsToId === mgr.id, 'tree returns reporting lines');

  // ---- manager: own subtree only ----
  const mt = (await call(mgr.token, 'GET', '/org-tree')).body;
  assert(mt.permissions.level === 'MANAGER', 'a person with reports is a manager');
  assert(mt.permissions.manageablePersonIds.includes(e1.id) && mt.permissions.manageablePersonIds.includes(e2.id) && !mt.permissions.manageablePersonIds.includes(out.id), 'manager can manage exactly their own reports');
  assert(mt.permissions.canCreatePeople === false && mt.permissions.canPlaceTopLevel === false, 'manager cannot create people or place at the top');
  assert((await move(mgr.token, e1.id, { reportsToId: e2.id })).status === 200, 'manager re-arranges people inside their team');
  assert((await move(mgr.token, e1.id, { reportsToId: mgr.id })).status === 200, 'manager moves them back');
  assert((await move(mgr.token, out.id, { reportsToId: mgr.id })).status === 403, 'manager cannot pull in someone from outside their team');
  assert((await move(mgr.token, e1.id, { reportsToId: out.id })).status === 403, 'manager cannot push their people outside their team');
  assert((await move(mgr.token, e1.id, { reportsToId: null })).status === 403, 'manager cannot take someone to the top of the chart');
  assert((await move(mgr.token, mgr.id, { reportsToId: e1.id })).status === 403, 'manager cannot change their own place');
  assert((await move(mgr.token, boss, { reportsToId: mgr.id })).status === 403, 'manager cannot touch the CEO');
  assert((await move(mgr.token, e2.id, { designation: 'Designer' })).status === 200, 'manager can set a title inside their team');
  assert((await move(mgr.token, out.id, { designation: 'Boss' })).status === 403, 'manager cannot set a title outside their team');

  // ---- viewer: read only ----
  const vt = (await call(out.token, 'GET', '/org-tree')).body;
  assert(vt.permissions.level === 'VIEWER' && vt.permissions.manageablePersonIds.length === 0, 'a person with no reports is a viewer');
  assert((await move(out.token, e1.id, { reportsToId: out.id })).status === 403, 'viewer cannot move anyone');
  assert((await call(out.token, 'POST', '/org-tree/people', { name: 'X', email: 'x-org-hier@example.com' })).status === 403, 'viewer cannot create people');
  assert((await call(mgr.token, 'POST', '/org-tree/people', { name: 'X', email: 'x-org-hier@example.com' })).status === 403, 'manager cannot create people');
  assert((await call(out.token, 'GET', '/org-tree/changes')).status === 403, 'viewer cannot read the change log');

  // ---- admin creates a person ----
  const created = await call(at, 'POST', '/org-tree/people', { name: 'Hier New Hire', email: 'org-hier-new@example.com', designation: 'Intern', reportsToId: mgr.id });
  assert(created.status === 201 ? Boolean(created.body.tempPassword) && created.body.reportsToId === mgr.id : created.status === 409, 'admin adds a person under a manager (or the fixture already exists)', String(created.status));

  // ---- teams the manager leads ----
  const teams = (await call(at, 'GET', '/organisation/teams')).body ?? [];
  let team = teams.find((t) => t.name === 'Hier Smoke Team');
  if (!team) team = (await call(at, 'POST', '/organisation/teams', { name: 'Hier Smoke Team' })).body;
  await call(at, 'PATCH', `/organisation/teams/${team.id}`, { managerId: mgr.id });
  assert((await call(mgr.token, 'PUT', `/org-tree/teams/${team.id}/members`, { userIds: [e1.id, e2.id] })).status === 200, 'manager sets the members of a team they lead');
  assert((await call(mgr.token, 'PUT', `/org-tree/teams/${team.id}/members`, { userIds: [e1.id, out.id] })).status === 403, 'manager cannot add an outsider to their team');
  assert((await call(out.token, 'PUT', `/org-tree/teams/${team.id}/members`, { userIds: [out.id] })).status === 403, 'a non-manager cannot change a team');
  const other = teams.find((t) => t.name === 'Tree Smoke Parent');
  if (other) assert((await call(mgr.token, 'PUT', `/org-tree/teams/${other.id}/members`, { userIds: [e1.id] })).status === 403, 'manager cannot change a team they do not lead');
  assert((await call(mgr.token, 'PATCH', `/organisation/teams/${team.id}`, { managerId: null })).status === 403, 'manager cannot reassign a team manager (admin only)');
  assert((await call(at, 'PUT', `/org-tree/teams/${team.id}/members`, { userIds: [] })).status === 200, 'admin can clear any team');

  // ---- audit ----
  const log = await call(at, 'GET', '/org-tree/changes?limit=60');
  assert(log.status === 200 && log.body.some((c) => c.kind === 'PERSON_MOVED') && log.body.some((c) => c.kind === 'TEAM_MEMBERS'), 'every change is in the admin change log');

  // ---- the top of the chart, and taking someone off it ----
  const person = async (id) => (await call(at, 'GET', '/org-tree')).body.people.find((x) => x.id === id);
  assert((await move(at, out.id, { reportsToId: null })).status === 200 && (await person(out.id)).isTop === true, 'admin places someone at the top and they are flagged as the head of the chart');
  assert((await move(at, out.id, { reportsToId: mgr.id })).status === 200 && (await person(out.id)).isTop === false, 'giving them a manager clears the top flag');
  assert((await call(mgr.token, 'DELETE', `/org-tree/people/${e1.id}`)).status === 403, 'a manager cannot take people off the chart');
  assert((await call(out.token, 'DELETE', `/org-tree/people/${e1.id}`)).status === 403, 'a viewer cannot take people off the chart');
  await move(at, mgr.id, { reportsToId: boss }); await move(at, e1.id, { reportsToId: mgr.id }); await move(at, e2.id, { reportsToId: mgr.id });
  const removed = await call(at, 'DELETE', `/org-tree/people/${mgr.id}`);
  assert(removed.status === 200 && removed.body.movedReports >= 3, 'admin takes a manager off the chart and their people move up', JSON.stringify(removed.body));
  assert((await person(e1.id)).reportsToId === boss && (await person(e2.id)).reportsToId === boss, 'their reports now sit under the manager above');
  const gone = await person(mgr.id);
  assert(gone.reportsToId === null && gone.isTop === false, 'the removed person is off the chart but still an active account');
  assert((await call(mgr.token, 'GET', '/org-tree')).status === 200, 'their account still works');
  await move(at, boss, { reportsToId: null });
  assert((await person(boss)).isTop === true, 'the CEO keeps the top flag with people below');

  const hire = ((await call(at, 'GET', '/users')).body ?? []).find((x) => x.email === 'org-hier-new@example.com');
  for (const u of [...(hire ? [hire] : []), e1, e2, out, mgr, { id: boss }]) await off(at, u.id);
  await call(at, 'PATCH', `/organisation/teams/${team.id}`, { managerId: null });
  if (failures) throw new Error(`${failures} org-hierarchy smoke assertion(s) failed`);
  console.log('Org hierarchy smoke passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
