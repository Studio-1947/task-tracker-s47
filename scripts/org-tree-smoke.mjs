#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers team managers, sub-teams and the org tree: who may read and edit it, loop prevention, no leaked emails.
// Teams cannot be deleted, so fixed fixture names are reused (find or create) and reset at the start.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };
const MEMBER_EMAIL = 'org-tree-smoke@example.com';

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
async function findOrCreateTeam(token, name) {
  const list = (await call(token, 'GET', '/organisation/teams')).body ?? [];
  const hit = list.find((t) => t.name === name);
  if (hit) return hit;
  return (await call(token, 'POST', '/organisation/teams', { name })).body;
}

async function main() {
  const admin = (await call(null, 'POST', '/auth/login', ADMIN)).body;
  assert(Boolean(admin?.accessToken), 'admin login');
  const at = admin.accessToken;

  const users = (await call(at, 'GET', '/users')).body ?? [];
  let member = users.find((u) => u.email === MEMBER_EMAIL);
  let temp;
  if (member) temp = (await call(at, 'POST', `/users/${member.id}/reset-password`)).body?.tempPassword;
  else { member = (await call(at, 'POST', '/users', { name: 'Org Tree Smoke', email: MEMBER_EMAIL, role: 'MEMBER' })).body; temp = member?.tempPassword; }
  const mt = (await call(null, 'POST', '/auth/login', { email: MEMBER_EMAIL, password: temp })).body?.accessToken;
  assert(Boolean(mt), 'fixture member login');

  const parent = await findOrCreateTeam(at, 'Tree Smoke Parent');
  const child = await findOrCreateTeam(at, 'Tree Smoke Child');
  assert(Boolean(parent?.id && child?.id), 'fixture teams exist');
  await call(at, 'PATCH', `/organisation/teams/${parent.id}`, { parentTeamId: null, managerId: null });
  await call(at, 'PATCH', `/organisation/teams/${child.id}`, { parentTeamId: null, managerId: null });
  await call(at, 'PUT', `/organisation/teams/${child.id}/members`, { userIds: [] });

  const set = await call(at, 'PATCH', `/organisation/teams/${child.id}`, { parentTeamId: parent.id, managerId: member.id });
  assert(set.status === 200, 'admin sets a parent team and a manager', JSON.stringify(set.body));
  const mem = await call(at, 'PUT', `/organisation/teams/${parent.id}/members`, { userIds: [member.id] });
  assert(mem.status === 200, 'admin sets team members', String(mem.status));

  const self = await call(at, 'PATCH', `/organisation/teams/${parent.id}`, { parentTeamId: parent.id });
  assert(self.status === 400, 'a team cannot be its own parent', String(self.status));
  const loop = await call(at, 'PATCH', `/organisation/teams/${parent.id}`, { parentTeamId: child.id });
  assert(loop.status === 400, 'a team cannot move under its own sub-team', String(loop.status));
  const badMgr = await call(at, 'PATCH', `/organisation/teams/${child.id}`, { managerId: '00000000-0000-4000-8000-000000000000' });
  assert(badMgr.status === 400, 'an unknown manager is rejected', String(badMgr.status));
  const badKey = await call(at, 'PATCH', `/organisation/teams/${child.id}`, { colour: 'red' });
  assert(badKey.status === 400, 'unknown fields are rejected', String(badKey.status));

  const denied = await call(mt, 'PATCH', `/organisation/teams/${child.id}`, { managerId: null });
  assert(denied.status === 403, 'a member cannot change teams', String(denied.status));
  const deniedMembers = await call(mt, 'PUT', `/organisation/teams/${child.id}/members`, { userIds: [member.id] });
  assert(deniedMembers.status === 403, 'a member cannot change team members', String(deniedMembers.status));

  const tree = await call(mt, 'GET', '/org-tree');
  assert(tree.status === 200, 'a member can read the org tree', String(tree.status));
  const c = tree.body?.teams?.find((t) => t.id === child.id);
  const p = tree.body?.teams?.find((t) => t.id === parent.id);
  assert(c?.parentTeamId === parent.id && c?.managerId === member.id, 'tree returns the hierarchy and manager');
  assert(p?.memberIds?.includes(member.id), 'tree returns members');
  const me = tree.body?.people?.find((x) => x.id === member.id);
  assert(Boolean(me) && !('email' in me) && !('role' in me), 'people carry no email or role', JSON.stringify(me));
  assert((await call(null, 'GET', '/org-tree')).status === 401, 'the tree needs a signed-in user');

  // Reset so the fixtures stay tidy for the browser run and the next run.
  if (failures) throw new Error(`${failures} org-tree smoke assertion(s) failed`);
  console.log('Org tree smoke passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
