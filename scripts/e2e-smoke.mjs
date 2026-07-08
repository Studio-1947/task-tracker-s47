#!/usr/bin/env node
// End-to-end smoke test against a RUNNING API (PRD §11.6): login -> create workspace
// -> create task -> change status, asserting the audit log records exactly one row
// per mutation. Run in CI against the built artifact; also usable locally.
//
//   node scripts/e2e-smoke.mjs           (defaults to http://localhost:3000/api)
//   API_URL=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node scripts/e2e-smoke.mjs

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function json(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function main() {
  // 1. login
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert(loginRes.ok, `login (${loginRes.status})`);
  const { accessToken, user } = await json(loginRes);
  assert(!!accessToken, 'received access token');
  const H = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` };

  // 2. create workspace
  const wsRes = await fetch(`${API}/workspaces`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ name: `E2E Smoke ${Date.now()}` }),
  });
  assert(wsRes.ok, `create workspace (${wsRes.status})`);
  const ws = await json(wsRes);

  // 3. add self as member (assignees must be workspace members)
  const memRes = await fetch(`${API}/workspaces/${ws.id}/members`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ add: [user.id] }),
  });
  assert(memRes.ok, `add member (${memRes.status})`);

  // 4. create task
  const taskRes = await fetch(`${API}/workspaces/${ws.id}/tasks`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ title: 'Smoke task', assigneeIds: [user.id] }),
  });
  assert(taskRes.ok, `create task (${taskRes.status})`);
  const task = await json(taskRes);
  assert(/^[A-Z]{2,6}-\d+$/.test(task.ref), `task got a human-readable ref (${task.ref})`);

  // 5. change status
  const patchRes = await fetch(`${API}/tasks/${task.id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ status: 'IN_PROGRESS' }),
  });
  assert(patchRes.ok, `change status (${patchRes.status})`);
  const updated = await json(patchRes);
  assert(updated.status === 'IN_PROGRESS', 'status is IN_PROGRESS');

  // 6. audit history: exactly one CREATED and one STATUS_CHANGED
  const histRes = await fetch(`${API}/tasks/${task.id}/history`, { headers: H });
  assert(histRes.ok, `fetch history (${histRes.status})`);
  const history = await json(histRes);
  const actions = history.map((h) => h.action);
  assert(actions.filter((a) => a === 'CREATED').length === 1, 'exactly one CREATED audit row');
  assert(
    actions.filter((a) => a === 'STATUS_CHANGED').length === 1,
    'exactly one STATUS_CHANGED audit row',
  );

  console.log(`\n✓ E2E smoke passed — audit trail: [${actions.join(', ')}]`);
}

main().catch((err) => {
  console.error('E2E smoke failed:', err);
  process.exit(1);
});
