#!/usr/bin/env node
// End-to-end smoke test for the weekly meeting mood board against a RUNNING API.
// Exercises week normalisation, 1st/2nd-half cards, progress roll-ups, mood
// check-ins, notes/comments, drag-and-drop reordering, and the member-vs-admin
// permission rules (including the week lock).
//
//   node scripts/meetings-smoke.mjs      (defaults to http://localhost:3000/api)
//   API_URL=... node scripts/meetings-smoke.mjs
//
// Requires the seeded admin (pnpm db:seed creates admin@). Creates one throwaway
// member for the permission checks and deactivates it afterwards.

const API = process.env.API_URL ?? 'http://localhost:3000/api';

const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
};

let failures = 0;

function assert(cond, msg, extra = '') {
  if (cond) {
    console.log(`✓ ${msg}`);
  } else {
    failures += 1;
    console.error(`✗ ${msg}${extra ? ` — ${extra}` : ''}`);
  }
}

async function call(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text };
  }
  return { status: res.status, body: parsed };
}

async function login(email, password) {
  const r = await call(null, 'POST', '/auth/login', { email, password });
  if (!r.body?.accessToken) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const plusDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

async function main() {
  const admin = await login(ADMIN.email, ADMIN.password);

  console.log('\n── board & week normalisation ──');
  const first = await call(admin, 'GET', `/meeting-boards?date=${ymd(new Date())}`);
  assert(first.status === 200, 'board loads for the current week', JSON.stringify(first.body));
  const board = first.body;
  assert(new Date(`${board.weekStart}T00:00:00`).getDay() === 1, 'weekStart is a Monday', board.weekStart);
  assert(board.days?.length === 5, 'board spans 5 working days (Mon-Fri)', JSON.stringify(board.days));
  assert(board.weekEnd === board.days[4], 'weekEnd is the Friday');

  const mid = await call(admin, 'GET', `/meeting-boards?date=${board.days[2]}`);
  assert(mid.body.id === board.id, 'any day in the week resolves to the same board');

  const [mon, , wed] = board.days;

  console.log('\n── cards in the 1st / 2nd half ──');
  const c1 = await call(admin, 'POST', `/meeting-boards/${board.id}/items`, {
    dayDate: mon,
    slot: 'FIRST',
    title: 'Draft the Q3 deck',
  });
  assert(c1.status === 201 && c1.body.slot === 'FIRST', 'card created in the 1st half');
  assert(c1.body?.status === 'PENDING' && c1.body?.position === 0, 'new card defaults to PENDING at position 0');

  const c2 = await call(admin, 'POST', `/meeting-boards/${board.id}/items`, {
    dayDate: mon,
    slot: 'FIRST',
    title: 'Review PR backlog',
  });
  assert(c2.body?.position === 1, 'a second card in the same cell appends', String(c2.body?.position));

  const c3 = await call(admin, 'POST', `/meeting-boards/${board.id}/items`, {
    dayDate: wed,
    slot: 'SECOND',
    title: 'Client sync',
    note: 'Bring the pricing sheet',
  });
  assert(c3.status === 201 && c3.body.slot === 'SECOND', 'card created in the 2nd half');

  const sat = await call(admin, 'POST', `/meeting-boards/${board.id}/items`, {
    dayDate: plusDays(board.weekStart, 5),
    slot: 'FIRST',
    title: 'Saturday work',
  });
  assert(sat.status === 400, 'a day outside Mon-Fri is rejected', `status ${sat.status}`);

  console.log('\n── status & progress ──');
  const done = await call(admin, 'PATCH', `/meeting-boards/items/${c1.body.id}`, { status: 'DONE' });
  assert(done.body?.status === 'DONE' && Boolean(done.body?.completedAt), 'DONE stamps completedAt');
  const reopened = await call(admin, 'PATCH', `/meeting-boards/items/${c1.body.id}`, { status: 'PENDING' });
  assert(reopened.body?.completedAt === null, 'leaving DONE clears completedAt');
  await call(admin, 'PATCH', `/meeting-boards/items/${c1.body.id}`, { status: 'DONE' });
  await call(admin, 'PATCH', `/meeting-boards/items/${c2.body.id}`, { status: 'IN_PROGRESS' });

  const scored = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
  const p = scored.progress;
  assert(p.total === 3 && p.done === 1 && p.inProgress === 1, 'board progress rolls up', JSON.stringify(p));
  assert(p.percent === 33, 'percent counts DONE only', String(p.percent));

  const me = scored.members.find((m) => m.user.email === ADMIN.email);
  assert(me?.firstHalf.total === 2 && me?.secondHalf.total === 1, 'per-member half roll-ups split correctly');

  console.log('\n── mood check-in ──');
  await call(admin, 'PUT', `/meeting-boards/${board.id}/mood`, { mood: 'GOOD', note: 'Solid week' });
  const remood = await call(admin, 'PUT', `/meeting-boards/${board.id}/mood`, { mood: 'BLOCKED' });
  assert(remood.body?.mood === 'BLOCKED', 'mood upserts instead of duplicating');
  const moody = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
  const rows = moody.members.filter((m) => m.user.email === ADMIN.email);
  assert(rows.length === 1 && rows[0].mood?.mood === 'BLOCKED', 'one member row carrying the latest mood');
  const badMood = await call(admin, 'PUT', `/meeting-boards/${board.id}/mood`, { mood: 'ECSTATIC' });
  assert(badMood.status === 400, 'an unknown mood is rejected', `status ${badMood.status}`);

  console.log('\n── notes & comments ──');
  const note = await call(admin, 'POST', `/meeting-boards/${board.id}/notes`, {
    body: 'Decision: ship the pricing page Thursday.',
  });
  assert(note.status === 201 && note.body.itemId === null, 'board-level meeting note created');
  const comment = await call(admin, 'POST', `/meeting-boards/${board.id}/notes`, {
    itemId: c3.body.id,
    body: 'Adding the discount tiers here.',
  });
  assert(comment.status === 201 && comment.body.itemId === c3.body.id, 'comment created on a card');

  const threaded = await call(admin, 'GET', `/meeting-boards/items/${c3.body.id}/notes`);
  assert(threaded.body?.length === 1, "a card's comment thread lists separately");

  const noted = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
  assert(noted.notes.length === 1, 'board payload carries only board-level notes');
  assert(noted.items.find((i) => i.id === c3.body.id)?.commentCount === 1, 'cards carry their comment count');

  const edited = await call(admin, 'PATCH', `/meeting-boards/notes/${note.body.id}`, {
    body: 'Decision: ship the pricing page Friday.',
  });
  assert(edited.body?.body.endsWith('Friday.'), 'a note can be edited by its author');

  console.log('\n── reordering ──');
  const moved = await call(admin, 'POST', `/meeting-boards/${board.id}/reorder`, {
    items: [{ id: c1.body.id, dayDate: wed, slot: 'SECOND', position: 1 }],
  });
  const landed = moved.body?.items?.find((i) => i.id === c1.body.id);
  assert(landed?.dayDate === wed && landed?.slot === 'SECOND', 'a card moves to another day/half');
  const offWeek = await call(admin, 'POST', `/meeting-boards/${board.id}/reorder`, {
    items: [{ id: c1.body.id, dayDate: '2020-01-04', slot: 'FIRST', position: 0 }],
  });
  assert(offWeek.status === 400, 'a move outside the week is rejected', `status ${offWeek.status}`);

  console.log('\n── week history ──');
  const weeks = await call(admin, 'GET', '/meeting-boards/weeks?limit=5');
  const row = weeks.body?.find((w) => w.id === board.id);
  assert(weeks.status === 200 && Boolean(row), 'the current week appears in the history list');
  assert(row?.progress?.total === 3 && row?.memberCount === 1, 'history rows carry progress and member counts');

  // Opening a week creates its board, so an untouched week must not litter the history.
  const future = await call(admin, 'GET', `/meeting-boards?date=${plusDays(board.weekStart, 70)}`);
  assert(future.status === 200 && future.body.items.length === 0, 'a far-future week opens empty');
  const afterBrowse = await call(admin, 'GET', '/meeting-boards/weeks?limit=20');
  assert(
    !afterBrowse.body?.some((w) => w.id === future.body.id),
    'merely browsing to an empty week keeps it out of the history',
  );

  console.log('\n── permissions ──');
  const email = `board-smoke-${Date.now()}@example.com`;
  const created = await call(admin, 'POST', '/users', { name: 'Board Smoke', email, role: 'MEMBER' });
  assert(created.status === 201, 'throwaway member created', JSON.stringify(created.body));
  const member = await login(email, created.body.tempPassword);

  const read = await call(member, 'GET', `/meeting-boards?date=${board.weekStart}`);
  assert(read.status === 200 && read.body.items.length === 3, 'a member can read the whole board');

  const edit = await call(member, 'PATCH', `/meeting-boards/items/${c1.body.id}`, { status: 'DONE' });
  assert(edit.status === 403, "a member cannot edit someone else's card", `status ${edit.status}`);

  const remove = await call(member, 'DELETE', `/meeting-boards/items/${c2.body.id}`);
  assert(remove.status === 403, "a member cannot delete someone else's card", `status ${remove.status}`);

  const assign = await call(member, 'POST', `/meeting-boards/${board.id}/items`, {
    userId: '00000000-0000-0000-0000-000000000001',
    dayDate: mon,
    slot: 'FIRST',
    title: 'Sneaky assign',
  });
  assert(assign.status === 403, 'a member cannot create a card for someone else', `status ${assign.status}`);

  const own = await call(member, 'POST', `/meeting-boards/${board.id}/items`, {
    dayDate: mon,
    slot: 'SECOND',
    title: 'My own card',
  });
  assert(own.status === 201, 'a member can create their own card');
  const ownDone = await call(member, 'PATCH', `/meeting-boards/items/${own.body.id}`, { status: 'DONE' });
  assert(ownDone.body?.status === 'DONE', 'a member can complete their own card');

  const theirComment = await call(member, 'POST', `/meeting-boards/${board.id}/notes`, {
    itemId: c3.body.id,
    body: 'Can we cover licensing too?',
  });
  assert(theirComment.status === 201, "a member can comment on someone else's card");

  const rewrite = await call(member, 'PATCH', `/meeting-boards/notes/${note.body.id}`, { body: 'rewritten' });
  assert(rewrite.status === 403, "a member cannot rewrite someone else's note", `status ${rewrite.status}`);


  // Dragging a card onto another person's swimlane row = PATCH with a new userId.
  const memberReassign = await call(member, 'PATCH', `/meeting-boards/items/${own.body.id}`, {
    userId: created.body.id === own.body.user.id ? board.id : created.body.id,
  });
  assert(
    memberReassign.status === 400 || memberReassign.status === 403,
    'a member cannot hand their card to someone else',
    `status ${memberReassign.status}`,
  );

  const adminReassign = await call(admin, 'PATCH', `/meeting-boards/items/${own.body.id}`, {
    userId: created.body.id,
    dayDate: wed,
    slot: 'FIRST',
    position: 0,
  });
  assert(
    adminReassign.body?.user?.id === created.body.id && adminReassign.body?.dayDate === wed,
    'an admin reassigns a card across members and days in one move',
    JSON.stringify(adminReassign.body?.user?.id),
  );
  const reassigned = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
  const owner = reassigned.members.find((m) => m.user.id === created.body.id);
  assert(owner?.firstHalf.total === 1, "the card lands in the new owner's 1st-half roll-up");

  const memberLock = await call(member, 'PATCH', `/meeting-boards/${board.id}`, { isLocked: true });
  assert(memberLock.status === 403, 'a member cannot lock the week', `status ${memberLock.status}`);

  console.log('\n── locking ──');
  const locked = await call(admin, 'PATCH', `/meeting-boards/${board.id}`, {
    isLocked: true,
    title: 'Weekly sync',
  });
  assert(locked.body?.isLocked === true && locked.body?.title === 'Weekly sync', 'an admin locks and titles the week');

  const afterLock = await call(member, 'PATCH', `/meeting-boards/items/${own.body.id}`, { status: 'PENDING' });
  assert(afterLock.status === 403, 'a locked week blocks member edits', `status ${afterLock.status}`);
  const lateNote = await call(member, 'POST', `/meeting-boards/${board.id}/notes`, { body: 'late note' });
  assert(lateNote.status === 403, 'a locked week blocks member notes', `status ${lateNote.status}`);
  const adminEdit = await call(admin, 'PATCH', `/meeting-boards/items/${c2.body.id}`, { status: 'DONE' });
  assert(adminEdit.body?.status === 'DONE', 'an admin can still edit a locked week');
  await call(admin, 'PATCH', `/meeting-boards/${board.id}`, { isLocked: false });

  console.log('\n── validation & cascade ──');
  const emptyTitle = await call(admin, 'POST', `/meeting-boards/${board.id}/items`, {
    dayDate: mon,
    slot: 'FIRST',
    title: '',
  });
  assert(emptyTitle.status === 400, 'an empty card title is rejected', `status ${emptyTitle.status}`);

  await call(admin, 'DELETE', `/meeting-boards/items/${c3.body.id}`);
  const pruned = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
  assert(!pruned.items.some((i) => i.id === c3.body.id), 'a deleted card disappears');
  assert(!pruned.notes.some((n) => n.itemId === c3.body.id), "a deleted card's comments cascade away");

  // Leave the board and the user directory as we found them.
  for (const item of pruned.items) await call(admin, 'DELETE', `/meeting-boards/items/${item.id}`);
  for (const n of pruned.notes) await call(admin, 'DELETE', `/meeting-boards/notes/${n.id}`);
  await call(admin, 'PATCH', `/users/${created.body.id}`, { isActive: false });

  if (failures > 0) {
    console.error(`\n✗ Meeting board smoke failed — ${failures} assertion(s)`);
    process.exit(1);
  }
  console.log('\n✓ Meeting board smoke passed — calendar, halves, progress, mood, notes, permissions, locking');
  process.exit(0);
}

main().catch((err) => {
  console.error('Meeting board smoke failed:', err);
  process.exit(1);
});
