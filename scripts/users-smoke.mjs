#!/usr/bin/env node
// End-to-end smoke test for the admin user directory against a RUNNING API.
// Covers the three admin actions that are easy to break silently — resetting a
// password, deactivating somebody, and removing them entirely — by asserting the
// *effect* (can they still log in? are their sessions gone? did their authored
// work survive?) rather than just the HTTP status. Also checks the self-lockout
// guards, the per-user project tags, and the deactivated-vs-removed separation.
//
//   node scripts/users-smoke.mjs      (defaults to http://localhost:3000/api)
//   API_URL=... node scripts/users-smoke.mjs
//
// Requires the seeded admin (pnpm db:seed creates admin@). Creates throwaway
// users and cleans up everything it can.

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

const stamp = Date.now();
const addr = (slug) => `users-smoke-${slug}-${stamp}@example.com`;

/**
 * Creates a user and walks them through the forced first-login password change.
 *
 * `reuse` is for the fixture that ends up authoring something: `audit_logs.user_id`
 * is RESTRICT, so once somebody has acted their row can never be hard-deleted and
 * a per-run address would leak one account on every single run. Reused accounts
 * are reactivated and re-added to the workspace instead.
 */
async function onboard(admin, name, email, workspaceIds, reuse = false) {
  if (reuse) {
    const found = ((await call(admin, 'GET', '/users')).body ?? []).find((u) => u.email === email);
    if (found) {
      await call(admin, 'PATCH', `/users/${found.id}`, { isActive: true });
      if (workspaceIds?.length) {
        for (const ws of workspaceIds) {
          await call(admin, 'POST', `/workspaces/${ws}/members`, { add: [found.id] });
        }
      }
      // The temp password is shown once, so reuse means minting a new one.
      const reset = await call(admin, 'POST', `/users/${found.id}/reset-password`);
      const password = `Smoke-${stamp}-Aa1!`;
      const first = await call(null, 'POST', '/auth/login', {
        email,
        password: reset.body.tempPassword,
      });
      await call(first.body.accessToken, 'POST', '/auth/change-password', {
        currentPassword: reset.body.tempPassword,
        newPassword: password,
      });
      return { id: found.id, email, password };
    }
  }
  const created = await call(admin, 'POST', '/users', {
    name,
    email,
    role: 'MEMBER',
    ...(workspaceIds ? { workspaceIds } : {}),
  });
  if (!created.body?.id) throw new Error(`could not create ${email}: ${JSON.stringify(created.body)}`);
  const password = `Smoke-${stamp}-Aa1!`;
  const firstLogin = await call(null, 'POST', '/auth/login', {
    email,
    password: created.body.tempPassword,
  });
  await call(firstLogin.body.accessToken, 'POST', '/auth/change-password', {
    currentPassword: created.body.tempPassword,
    newPassword: password,
  });
  return { id: created.body.id, email, password };
}

async function login(email, password) {
  return call(null, 'POST', '/auth/login', { email, password });
}

async function workspaceMember(admin, workspaceId, userId) {
  const r = await call(admin, 'GET', `/workspaces/${workspaceId}/members`);
  return (r.body ?? []).find((m) => m.id === userId) ?? null;
}

async function sessionCount(admin, userId) {
  const r = await call(admin, 'GET', '/users/sessions');
  return (r.body ?? []).filter((s) => s.userId === userId).length;
}

async function main() {
  const adminLogin = await login(ADMIN.email, ADMIN.password);
  const admin = adminLogin.body?.accessToken;
  if (!admin) throw new Error(`admin login failed: ${JSON.stringify(adminLogin.body)}`);
  const me = (await call(admin, 'GET', '/auth/me')).body;

  console.log('\n── reset password ──');
  const target = await onboard(admin, 'Reset Target', addr('reset'));
  assert((await login(target.email, target.password)).status === 200, 'the user can log in beforehand');

  const reset = await call(admin, 'POST', `/users/${target.id}/reset-password`);
  assert(reset.status === 201, 'an admin can reset a password', `status ${reset.status}`);
  assert(
    typeof reset.body?.tempPassword === 'string' && reset.body.tempPassword.length > 0,
    'the reset hands back a one-time password',
  );

  const stale = await login(target.email, target.password);
  assert(stale.status === 401, 'the old password stops working', `status ${stale.status}`);
  const fresh = await login(target.email, reset.body.tempPassword);
  assert(fresh.status === 200, 'the new temporary password works', `status ${fresh.status}`);
  assert(
    fresh.body?.user?.mustChangePassword === true,
    'the user is forced to change it on next login',
  );
  assert((await sessionCount(admin, target.id)) <= 1, 'the reset invalidates their earlier sessions');

  console.log('\n── deactivate & reactivate ──');
  const off = await call(admin, 'PATCH', `/users/${target.id}`, { isActive: false });
  assert(off.status === 200 && off.body?.isActive === false, 'an admin can deactivate a user');
  const blocked = await login(target.email, reset.body.tempPassword);
  assert(blocked.status === 401, 'a deactivated user cannot log in', `status ${blocked.status}`);

  assert(
    off.body?.removedAt === null,
    'a deactivation is not stamped as a removal',
    JSON.stringify(off.body?.removedAt),
  );

  const on = await call(admin, 'PATCH', `/users/${target.id}`, { isActive: true });
  assert(on.status === 200 && on.body?.isActive === true, 'an admin can reactivate a user');
  assert(on.body?.removedAt === null, 'a reactivated user carries no removal stamp');
  assert((await login(target.email, reset.body.tempPassword)).status === 200, 'they can log in again');

  console.log('\n── an admin cannot lock themselves out ──');
  const selfOff = await call(admin, 'PATCH', `/users/${me.id}`, { isActive: false });
  assert(selfOff.status === 400, 'self-deactivation is refused', `status ${selfOff.status}`);
  const selfDemote = await call(admin, 'PATCH', `/users/${me.id}`, { role: 'MEMBER' });
  assert(selfDemote.status === 400, 'self-demotion is refused', `status ${selfDemote.status}`);
  const selfRemove = await call(admin, 'DELETE', `/users/${me.id}`);
  assert(selfRemove.status === 400, 'self-removal is refused', `status ${selfRemove.status}`);
  assert(
    (await call(admin, 'GET', '/auth/me')).body?.isActive === true,
    'the admin is still active after all three attempts',
  );

  console.log('\n── remove a user who never did anything ──');
  const unused = await call(admin, 'POST', '/users', {
    name: 'Never Used',
    email: addr('unused'),
    role: 'MEMBER',
  });
  const wiped = await call(admin, 'DELETE', `/users/${unused.body.id}`);
  assert(wiped.status === 200, 'an admin can remove a user', `status ${wiped.status}`);
  assert(wiped.body?.deleted === true, 'a user with no history is deleted outright');
  const directory = (await call(admin, 'GET', '/users')).body ?? [];
  assert(!directory.some((u) => u.id === unused.body.id), 'their row is gone from the directory');

  console.log('\n── remove a user who has history ──');
  const workspaces = (await call(admin, 'GET', '/workspaces')).body ?? [];
  const ws = workspaces[0];
  const project = ws ? ((await call(admin, 'GET', `/workspaces/${ws.id}/projects`)).body ?? [])[0] : null;

  if (!project) {
    console.log('⚠ no seeded workspace/project — skipping the history-removal checks');
  } else {
    // Fixed address + reuse: this one authors a task and so can never be erased.
    const author = await onboard(
      admin,
      'History Author',
      'users-smoke-history@example.com',
      [ws.id],
      true,
    );
    const authorToken = (await login(author.email, author.password)).body.accessToken;
    const authored = await call(authorToken, 'POST', `/workspaces/${ws.id}/tasks`, {
      projectId: project.id,
      title: `Authored by the smoke user ${stamp}`,
      assigneeIds: [author.id],
    });
    assert(authored.status === 201, 'the user authors a task first', `status ${authored.status}`);

    const tagged = ((await call(admin, 'GET', '/users')).body ?? []).find((u) => u.id === author.id);
    assert(
      tagged?.projects?.some((p) => p.id === project.id),
      'the directory tags them with the project they have work in',
      JSON.stringify(tagged?.projects),
    );
    assert(
      tagged?.projects?.every((p) => p.workspaceName && typeof p.taskCount === 'number'),
      'each project tag carries its workspace and task count',
    );

    console.log('\n── workspace membership follows the account ──');
    const asMember = await workspaceMember(admin, ws.id, author.id);
    assert(Boolean(asMember), 'a new member shows up in the workspace member list');
    assert(asMember?.isActive === true, 'the member row reports whether they can sign in');

    // Suspension keeps the membership — it is meant to be reversible — but the
    // row has to say so, or they read as an ordinary member who can take work.
    await call(admin, 'PATCH', `/users/${author.id}`, { isActive: false });
    const suspendedMember = await workspaceMember(admin, ws.id, author.id);
    assert(Boolean(suspendedMember), 'a deactivated person keeps their workspace membership');
    assert(suspendedMember?.isActive === false, 'the member list flags them as deactivated');
    await call(admin, 'PATCH', `/users/${author.id}`, { isActive: true });
    // The deactivation above deleted their sessions, so sign back in to give the
    // removal below something to revoke.
    await login(author.email, author.password);

    const beforeCount = (await call(admin, 'GET', `/workspaces/${ws.id}`)).body?.memberCount ?? 0;
    assert((await sessionCount(admin, author.id)) > 0, 'they have a live session before removal');
    const removed = await call(admin, 'DELETE', `/users/${author.id}`);
    assert(removed.status === 200, 'an admin can remove a user with history');
    assert(removed.body?.deleted === false, 'their row is kept, because history references it');

    const after = ((await call(admin, 'GET', '/users')).body ?? []).find((u) => u.id === author.id);
    assert(Boolean(after), 'the kept row is still listed');
    assert(after?.isActive === false, 'the removed user is deactivated');
    assert(after?.workspaceCount === 0, 'they are off every workspace');
    // The reported bug: removing somebody left them sitting in this list.
    assert(
      (await workspaceMember(admin, ws.id, author.id)) === null,
      'a removed person is gone from the workspace member list',
    );
    const afterCount = (await call(admin, 'GET', `/workspaces/${ws.id}`)).body?.memberCount ?? 0;
    assert(
      afterCount === beforeCount - 1,
      "the workspace's member count drops by one",
      `${beforeCount} -> ${afterCount}`,
    );
    assert((after?.projects ?? []).length === 0, 'their project tags are cleared');
    assert((await sessionCount(admin, author.id)) === 0, 'every session of theirs is revoked');
    assert(
      (await login(author.email, author.password)).status === 401,
      'a removed user cannot log back in',
    );

    console.log('\n── deactivated and removed are told apart ──');
    assert(
      typeof after?.removedAt === 'string',
      'a removed user is stamped with when they were removed',
      JSON.stringify(after?.removedAt),
    );
    // Both are isActive:false, so the stamp is the only thing separating them.
    const suspended = ((await call(admin, 'GET', '/users')).body ?? []).find(
      (u) => u.id === target.id,
    );
    assert(
      after?.isActive === false && suspended?.isActive === true,
      'the two live in different states before comparison',
    );

    const reinstated = await call(admin, 'PATCH', `/users/${author.id}`, { isActive: true });
    assert(reinstated.status === 200, 'a removed user can be reinstated');
    assert(reinstated.body?.removedAt === null, 'reinstating clears the removal stamp');
    assert(
      (await login(author.email, author.password)).status === 200,
      'the reinstated user can sign in again',
    );
    const back = ((await call(admin, 'GET', '/users')).body ?? []).find((u) => u.id === author.id);
    assert(
      back?.workspaceCount === 0,
      'reinstating does NOT restore the workspaces removal took away',
      `workspaceCount ${back?.workspaceCount}`,
    );
    await call(admin, 'DELETE', `/users/${author.id}`);

    const survivor = await call(admin, 'GET', `/tasks/${authored.body.id}`);
    assert(survivor.status === 200, 'the work they authored survives the removal');
    assert(
      (survivor.body?.assignees ?? []).length === 0,
      'their task assignments are released',
      JSON.stringify(survivor.body?.assignees),
    );

    await call(admin, 'DELETE', `/tasks/${authored.body.id}`);
  }

  console.log('\n── cleanup ──');
  const removeTarget = await call(admin, 'DELETE', `/users/${target.id}`);
  assert(removeTarget.status === 200, 'the throwaway user is cleaned up');

  if (failures > 0) {
    console.error(`\n✗ Users smoke failed — ${failures} assertion(s)`);
    process.exit(1);
  }
  console.log(
    '\n✓ Users smoke passed — password reset, deactivate/reactivate, self-lockout guards, removal (both paths), workspace-membership follow-through, deactivated-vs-removed separation, project tags',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Users smoke failed:', err);
  process.exit(1);
});
