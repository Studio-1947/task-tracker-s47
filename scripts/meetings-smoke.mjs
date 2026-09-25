#!/usr/bin/env node
// End-to-end smoke test for the weekly meeting mood board against a RUNNING API.
// Exercises week normalisation, 1st/2nd-half cards, progress roll-ups, mood
// check-ins, notes/comments, drag-and-drop reordering, carry-forward of unfinished
// work, project filing with its mirrored workspace task, and the member-vs-admin
// permission rules (including the week lock).
//
//   node scripts/meetings-smoke.mjs      (defaults to http://localhost:3000/api)
//   API_URL=... MEETING_SMOKE_DATE=YYYY-MM-DD node scripts/meetings-smoke.mjs
//
// Requires the seeded admin (pnpm db:seed creates admin@). Creates one throwaway
// member for the permission checks and deactivates it afterwards.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const TEST_DATE = process.env.MEETING_SMOKE_DATE;

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
  const first = await call(admin, 'GET', `/meeting-boards?date=${TEST_DATE ?? ymd(new Date())}`);
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
  // Reused across runs rather than minted fresh each time: a per-run account
  // can never be hard-deleted once it has touched anything, so the old approach
  // left a deactivated "Board Smoke" row behind on every single run.
  const email = 'board-smoke@example.com';
  const directory = (await call(admin, 'GET', '/users')).body ?? [];
  const existing = directory.find((u) => u.email === email);
  const created = existing
    ? // The temp password is only shown once, so reuse means resetting it.
      {
        status: 201,
        body: {
          ...existing,
          ...(await call(admin, 'POST', `/users/${existing.id}/reset-password`)).body,
        },
      }
    : await call(admin, 'POST', '/users', { name: 'Board Smoke', email, role: 'MEMBER' });
  // A previous run may have left it deactivated; it must be able to log in.
  if (existing) await call(admin, 'PATCH', `/users/${existing.id}`, { isActive: true });
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
  // Restore the unfinished state required by the carry-forward scenario below.
  await call(admin, 'PATCH', `/meeting-boards/items/${c2.body.id}`, { status: 'IN_PROGRESS' });

  console.log('\n── carry-forward of unfinished work ──');
  // Monday cards that never finished should reappear on every later day up to
  // today; anything already DONE must not.
  const carryBoard = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
  const elapsed = carryBoard.days.filter((d) => d > mon && d <= ymd(new Date()));
  assert(Array.isArray(carryBoard.carryOver), 'the board payload carries a carryOver list');

  const openCarry = carryBoard.carryOver.filter((i) => i.id === c2.body.id);
  assert(
    openCarry.length === elapsed.length,
    `an unfinished Monday card is carried onto each elapsed later day (${elapsed.length})`,
    `got ${openCarry.length}`,
  );
  assert(
    openCarry.every((i) => i.carriedFrom === mon),
    'each carried copy points back at the day it was planned for',
  );
  assert(
    openCarry.every((i) => elapsed.includes(i.dayDate)),
    'carried copies only land on days that have already happened',
  );
  assert(
    !carryBoard.carryOver.some((i) => i.id === c1.body.id),
    'a finished card is not carried forward',
  );
  assert(
    carryBoard.items.every((i) => i.carriedFrom === null),
    'stored cards never claim to be carried copies',
  );
  assert(
    carryBoard.progress.total === carryBoard.items.length,
    'carried copies are excluded from the roll-up',
    `${carryBoard.progress.total} vs ${carryBoard.items.length}`,
  );

  // Closing the card retires every copy at once — they are one row, shown twice.
  await call(admin, 'PATCH', `/meeting-boards/items/${c2.body.id}`, { status: 'DONE' });
  const closed = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
  assert(
    !closed.carryOver.some((i) => i.id === c2.body.id),
    'finishing the card clears all of its carried copies',
  );
  await call(admin, 'PATCH', `/meeting-boards/items/${c2.body.id}`, { status: 'IN_PROGRESS' });

  // On a Monday nothing later has elapsed yet, so the assertions above can only
  // prove the negative. Replay the same rules on a week that has fully run out.
  const pastWeek = plusDays(board.weekStart, -14);
  const past = (await call(admin, 'GET', `/meeting-boards?date=${pastWeek}`)).body;
  const [pastMon, pastTue] = past.days;
  const stale = await call(admin, 'POST', `/meeting-boards/${past.id}/items`, {
    dayDate: pastMon,
    slot: 'FIRST',
    title: 'Never finished this',
    status: 'IN_PROGRESS',
  });
  const shipped = await call(admin, 'POST', `/meeting-boards/${past.id}/items`, {
    dayDate: pastMon,
    slot: 'FIRST',
    title: 'Finished this one',
    status: 'DONE',
  });
  const trailed = (await call(admin, 'GET', `/meeting-boards?date=${pastWeek}`)).body;
  const trail = trailed.carryOver.filter((i) => i.id === stale.body.id);
  assert(trail.length === 4, 'an elapsed week trails an open card Tue-Fri', `got ${trail.length}`);
  assert(
    trail.map((i) => i.dayDate).join(',') === trailed.days.slice(1).join(','),
    'the trail lands on consecutive days after the planned one',
  );
  assert(
    !trailed.carryOver.some((i) => i.id === shipped.body.id),
    'a card finished on the day it was planned leaves no trail',
  );

  // A card planned mid-week only trails from its own day onward.
  const late = await call(admin, 'POST', `/meeting-boards/${past.id}/items`, {
    dayDate: pastTue,
    slot: 'SECOND',
    title: 'Started Tuesday',
  });
  const lateTrail = (await call(admin, 'GET', `/meeting-boards?date=${pastWeek}`)).body.carryOver.filter(
    (i) => i.id === late.body.id,
  );
  assert(lateTrail.length === 3, 'a Tuesday card trails Wed-Fri only', `got ${lateTrail.length}`);
  assert(
    lateTrail.every((i) => i.dayDate > pastTue),
    'a card is never carried backwards',
  );

  for (const item of [stale, shipped, late]) {
    await call(admin, 'DELETE', `/meeting-boards/items/${item.body.id}`);
  }

  console.log('\n── project filing & the mirrored task ──');
  const options = await call(admin, 'GET', '/meeting-boards/projects');
  assert(options.status === 200 && Array.isArray(options.body), 'the project picker lists options');
  const project = options.body[0];

  if (!project) {
    console.log('⚠ no projects seeded — skipping the mirror-task checks');
  } else {
    assert(
      Boolean(project.workspaceId && project.taskPrefix && project.workspaceName),
      'a project option carries its workspace and task prefix',
    );

    const filed = await call(admin, 'POST', `/meeting-boards/${board.id}/items`, {
      dayDate: mon,
      slot: 'SECOND',
      title: 'Ship the pricing page',
      note: 'Agreed in the meeting',
      projectId: project.id,
    });
    assert(filed.status === 201, 'a card can be filed under a project', JSON.stringify(filed.body));
    assert(filed.body?.project?.id === project.id, 'the card reports the project it is filed under');
    assert(Boolean(filed.body?.taskId), 'filing the card mirrors it as a workspace task');
    assert(
      filed.body?.taskRef?.startsWith(`${project.taskPrefix}-`),
      'the mirror task gets a human-readable ref',
      String(filed.body?.taskRef),
    );

    const task = await call(admin, 'GET', `/tasks/${filed.body.taskId}`);
    assert(task.status === 200, 'the mirror task is a real task in the tracker');
    assert(task.body?.title === 'Ship the pricing page', 'the mirror task copies the card title');
    assert(task.body?.description === 'Agreed in the meeting', 'the card note becomes the description');
    assert(task.body?.status === 'TODO', 'PENDING maps to TODO', String(task.body?.status));
    assert(task.body?.projectId === project.id, 'the mirror task lands in the chosen project');

    // Board -> task.
    await call(admin, 'PATCH', `/meeting-boards/items/${filed.body.id}`, {
      status: 'IN_PROGRESS',
      title: 'Ship the pricing page v2',
    });
    const pushed = await call(admin, 'GET', `/tasks/${filed.body.taskId}`);
    assert(pushed.body?.status === 'IN_PROGRESS', 'moving the card moves the task');
    assert(pushed.body?.title === 'Ship the pricing page v2', 'renaming the card renames the task');

    // Task -> board, reconciled on the next board read.
    await call(admin, 'PATCH', `/tasks/${filed.body.taskId}`, { status: 'DONE' });
    const synced = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
    const back = synced.items.find((i) => i.id === filed.body.id);
    assert(back?.status === 'DONE', 'completing the task ticks the card off', String(back?.status));
    assert(Boolean(back?.completedAt), 'the reconciled card gets a completedAt stamp');

    // IN_REVIEW has no board equivalent and must fold into IN_PROGRESS.
    await call(admin, 'PATCH', `/tasks/${filed.body.taskId}`, { status: 'IN_REVIEW' });
    const review = (await call(admin, 'GET', `/meeting-boards?date=${board.weekStart}`)).body;
    assert(
      review.items.find((i) => i.id === filed.body.id)?.status === 'IN_PROGRESS',
      'IN_REVIEW folds back to IN_PROGRESS on the card',
    );
    const stable = await call(admin, 'GET', `/tasks/${filed.body.taskId}`);
    assert(stable.body?.status === 'IN_REVIEW', 'reconciling the card leaves the task alone');

    const grouped = review.projects.find((g) => g.project?.id === project.id);
    assert(Boolean(grouped), 'the board reports a per-project roll-up');
    assert(
      review.projects.some((g) => g.project === null),
      'unfiled cards get their own roll-up row',
    );

    const unfiled = await call(admin, 'PATCH', `/meeting-boards/items/${filed.body.id}`, {
      projectId: null,
    });
    assert(unfiled.body?.project === null, 'a card can be detached from its project');
    const survivor = await call(admin, 'GET', `/tasks/${filed.body.taskId}`);
    assert(survivor.status === 200, 'detaching the card leaves the task standing');

    const badProject = await call(admin, 'POST', `/meeting-boards/${board.id}/items`, {
      dayDate: mon,
      slot: 'FIRST',
      title: 'Nowhere',
      projectId: '00000000-0000-0000-0000-000000000000',
    });
    assert(badProject.status === 404, 'an unknown project is rejected', `status ${badProject.status}`);

    await call(admin, 'DELETE', `/meeting-boards/items/${filed.body.id}`);
    const orphan = await call(admin, 'GET', `/tasks/${filed.body.taskId}`);
    assert(orphan.status === 200, 'deleting the card never deletes the mirrored task');

    // That surviving task is the assertion's whole point, so the suite has to be
    // the one to clear it up — otherwise every run leaves one behind.
    await call(admin, 'DELETE', `/tasks/${filed.body.taskId}`);
  }

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
  // The account is deliberately left in place for the next run to reuse.

  if (failures > 0) {
    console.error(`\n✗ Meeting board smoke failed — ${failures} assertion(s)`);
    process.exit(1);
  }
  console.log(
    '\n✓ Meeting board smoke passed — calendar, halves, progress, mood, notes, carry-forward, projects & mirror tasks, permissions, locking',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Meeting board smoke failed:', err);
  process.exit(1);
});
