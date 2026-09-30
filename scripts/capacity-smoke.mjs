#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers task blockers, unblocking, and task dependencies (P01).

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const OWNER = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
};

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

async function login(account) {
  const result = await call(null, 'POST', '/auth/login', account);
  if (!result.body?.accessToken) throw new Error(`Login failed for ${account.email}: ${result.status}`);
  return result.body;
}

async function main() {
  const ownerLogin = await login(OWNER);
  const token = ownerLogin.accessToken;

  const wsResult = await call(token, 'POST', '/workspaces', { name: `Capacity Smoke ${Date.now()}` });
  assert(wsResult.status === 201, 'workspace created', JSON.stringify(wsResult.body));
  const workspace = wsResult.body;
  try {
    const projects = await call(token, 'GET', `/workspaces/${workspace.id}/projects`);
    const project = projects.body?.[0];
    assert(Boolean(project), 'default project available');

    const t1 = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, { projectId: project.id, title: 'Predecessor task' });
    const t2 = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, { projectId: project.id, title: 'Successor task' });
    assert(t1.status === 201 && t2.status === 201, 'tasks created');

    // Blocker test
    const blockRes = await call(token, 'POST', `/tasks/${t2.body.id}/blockers`, {
      reason: 'Waiting for design assets',
      unblockerUserId: ownerLogin.user.id,
    });
    assert(blockRes.status === 201, 'blocker recorded', JSON.stringify(blockRes.body));
    const blocker = blockRes.body;

    const unblockRes = await call(token, 'POST', `/tasks/blockers/${blocker.id}/unblock`, undefined);
    assert(unblockRes.status === 201 || unblockRes.status === 200, 'task unblocked', JSON.stringify(unblockRes.body));

    // Dependency test
    const depRes = await call(token, 'POST', '/tasks/dependencies', {
      predecessorTaskId: t1.body.id,
      successorTaskId: t2.body.id,
      isBlocking: true,
    });
    assert(depRes.status === 201, 'dependency created', JSON.stringify(depRes.body));
    const dep = depRes.body;

    const delDepRes = await call(token, 'DELETE', `/tasks/dependencies/${dep.id}`);
    assert(delDepRes.status === 200, 'dependency removed', JSON.stringify(delDepRes.body));

    await call(token, 'DELETE', `/tasks/${t1.body.id}`);
    await call(token, 'DELETE', `/tasks/${t2.body.id}`);
  } finally {
    if (workspace?.id) await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} capacity smoke assertion(s) failed`);
  console.log('Capacity smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
