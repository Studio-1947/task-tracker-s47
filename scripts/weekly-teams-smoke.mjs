#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers the per-team roll-up on the Weekly tasks board (Tech, Production, ...): done/total per team, people with
// nothing planned, the "no team" row, and that every signed-in person sees the same numbers.
// Runs on its own isolated past week (41 weeks back) and clears it in `finally`, so it never touches a week people use.
// Needs the org-hierarchy fixtures (users org-hier-*@example.com); it creates them when missing.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };

function isolatedWeek() {
  const d = new Date();
  d.setDate(d.getDate() - 41 * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TEST_DATE = process.env.WEEKLY_TEAMS_SMOKE_DATE ?? isolatedWeek();

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
  return { id: u.id, token };
}
async function team(at, name, managerId = null) {
  const list = (await call(at, 'GET', '/organisation/teams')).body ?? [];
  let t = list.find((x) => x.name === name);
  if (!t) t = (await call(at, 'POST', '/organisation/teams', { name })).body;
  await call(at, 'PATCH', `/organisation/teams/${t.id}`, { managerId, parentTeamId: null });
  return t;
}

async function main() {
  const at = (await call(null, 'POST', '/auth/login', ADMIN)).body.accessToken;
  const e1 = await provision(at, 'e1', 'Hier Staff One');
  const e2 = await provision(at, 'e2', 'Hier Staff Two');
  const mgr = await provision(at, 'mgr', 'Hier Manager');
  const out = await provision(at, 'out', 'Hier Outsider');
  const idleUser = (await call(at, 'GET', '/users')).body.find((u) => u.email === 'org-hier-new@example.com');

  // Fresh membership for the fixture teams, and nobody else from these accounts in any other team.
  const allTeams = (await call(at, 'GET', '/organisation/teams')).body ?? [];
  for (const t of allTeams) {
    const ids = (await call(at, 'GET', `/organisation/teams/${t.id}/members`)).body ?? [];
    if (ids.some((id) => [e1.id, e2.id, mgr.id, out.id].includes(id))) {
      await call(at, 'PUT', `/organisation/teams/${t.id}/members`, { userIds: ids.filter((id) => ![e1.id, e2.id, mgr.id, out.id].includes(id)) });
    }
  }
  const tech = await team(at, 'Weekly Smoke Tech');
  const prod = await team(at, 'Weekly Smoke Production');
  await call(at, 'PUT', `/organisation/teams/${tech.id}/members`, { userIds: [e1.id, e2.id, ...(idleUser ? [idleUser.id] : [])] });
  await call(at, 'PUT', `/organisation/teams/${prod.id}/members`, { userIds: [mgr.id] });

  let boardId = null;
  try {
    const board = (await call(at, 'GET', `/meeting-boards?date=${TEST_DATE}`)).body;
    boardId = board.id;
    for (const i of board.items) await call(at, 'DELETE', `/meeting-boards/items/${i.id}`);
    const [mon, tue] = board.days;
    const card = (userId, title, status, day = mon) => call(at, 'POST', `/meeting-boards/${board.id}/items`, { userId, dayDate: day, slot: 'FIRST', title, status });

    assert((await card(e1.id, 'Tech task A', 'DONE')).status === 201, 'tech card 1 (done)');
    assert((await card(e1.id, 'Tech task B', 'PENDING', tue)).status === 201, 'tech card 2 (pending)');
    assert((await card(e2.id, 'Tech task C', 'IN_PROGRESS')).status === 201, 'tech card 3 (in progress)');
    assert((await card(mgr.id, 'Production task A', 'DONE')).status === 201, 'production card (done)');
    assert((await card(out.id, 'Loose task', 'PENDING')).status === 201, 'card for someone in no team');

    const read = (await call(at, 'GET', `/meeting-boards?date=${TEST_DATE}`)).body;
    const rows = read.teams ?? [];
    const t = rows.find((r) => r.team?.id === tech.id);
    const p = rows.find((r) => r.team?.id === prod.id);
    const none = rows.find((r) => r.team === null);
    assert(Boolean(t && p), 'the board returns a row per team');
    assert(t.progress.total === 3 && t.progress.done === 1 && t.progress.inProgress === 1 && t.progress.pending === 1 && t.progress.percent === 33, 'Tech: 1 of 3 done (33%)', JSON.stringify(t?.progress));
    assert(t.memberIds.length === 2 && t.memberIds.includes(e1.id) && t.memberIds.includes(e2.id), 'Tech lists the two people who planned work');
    assert(t.peopleCount === (idleUser ? 3 : 2) && t.idleCount === (idleUser ? 1 : 0), 'Tech counts people with nothing planned', `${t.peopleCount}/${t.idleCount}`);
    assert(p.progress.total === 1 && p.progress.done === 1 && p.progress.percent === 100 && p.peopleCount === 1, 'Production: 1 of 1 done (100%)', JSON.stringify(p?.progress));
    assert(Boolean(none) && none.progress.total === 1 && none.memberIds.includes(out.id), 'people with cards but no team get their own row', JSON.stringify(none));
    assert(rows.filter((r) => r.team).every((r, i, a) => i === 0 || a[i - 1].team.name.localeCompare(r.team.name) <= 0), 'team rows are alphabetical');
    assert(rows[rows.length - 1].team === null, 'the no-team row comes last');
    assert(read.progress.total === 5, 'the all-people total still counts each card once', String(read.progress.total));
    assert(!rows.some((r) => r.team?.id === allTeams.find((x) => x.name === 'Tree Smoke Child')?.id && r.peopleCount === 0), 'teams with nobody are left out');

    // A status change moves the team's number.
    const techCard = read.items.find((i) => i.title === 'Tech task B');
    await call(at, 'PATCH', `/meeting-boards/items/${techCard.id}`, { status: 'DONE' });
    const after = (await call(at, 'GET', `/meeting-boards?date=${TEST_DATE}`)).body.teams.find((r) => r.team?.id === tech.id);
    assert(after.progress.done === 2 && after.progress.percent === 67, 'finishing a card moves its team (2 of 3, 67%)', JSON.stringify(after?.progress));

    // Everyone reads the same numbers.
    const asMember = (await call(e1.token, 'GET', `/meeting-boards?date=${TEST_DATE}`)).body;
    const mt = asMember.teams?.find((r) => r.team?.id === tech.id);
    assert(mt?.progress.done === 2 && mt?.progress.total === 3, 'a plain member sees the same team numbers', JSON.stringify(mt?.progress));
  } finally {
    if (boardId) {
      const b = (await call(at, 'GET', `/meeting-boards?date=${TEST_DATE}`)).body;
      for (const i of b?.items ?? []) await call(at, 'DELETE', `/meeting-boards/items/${i.id}`).catch(() => null);
    }
    for (const t of [tech, prod]) await call(at, 'PUT', `/organisation/teams/${t.id}/members`, { userIds: [] });
  }
  if (failures) throw new Error(`${failures} weekly-teams smoke assertion(s) failed`);
  console.log('Weekly teams smoke passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
