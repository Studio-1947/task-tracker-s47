#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers parent effort roll-up from effort-bearing children (PRD §3 "Parent
// rollup", AT06): 20+60+25+15+15 = 135 minutes counted exactly once, direct
// estimate edits blocked on the parent once it has effort-bearing children,
// and the rollup recalculating when a child is archived.

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

  const wsResult = await call(token, 'POST', '/workspaces', { name: `Rollup Smoke ${Date.now()}` });
  assert(wsResult.status === 201, 'workspace created', JSON.stringify(wsResult.body));
  const workspace = wsResult.body;
  try {
    const projects = await call(token, 'GET', `/workspaces/${workspace.id}/projects`);
    const project = projects.body?.[0];
    assert(Boolean(project), 'default project available');

    const parentCreated = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, {
      projectId: project.id,
      title: 'Promotional poster',
    });
    assert(parentCreated.status === 201, 'parent task created', JSON.stringify(parentCreated.body));
    const parent = parentCreated.body;
    assert(parent.baselineEstimateMinutes === null, 'childless parent has no forced estimate');

    // Example A from the spec: 20, 60, 25, 15, 15 minute children -> 135 total.
    const minutes = [20, 60, 25, 15, 15];
    for (const [i, m] of minutes.entries()) {
      const child = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, {
        projectId: project.id,
        parentTaskId: parent.id,
        title: `Work item ${i + 1}`,
        baselineEstimateMinutes: m,
        currentEstimateMinutes: m,
        remainingEstimateMinutes: m,
      });
      assert(child.status === 201, `child ${i + 1} created`, JSON.stringify(child.body));
    }

    const afterChildren = await call(token, 'GET', `/tasks/${parent.id}`);
    assert(afterChildren.body.baselineEstimateMinutes === 135, 'parent baseline rolls up to 135 minutes, not 270', String(afterChildren.body.baselineEstimateMinutes));
    assert(afterChildren.body.currentEstimateMinutes === 135, 'parent current estimate rolls up to 135');
    assert(afterChildren.body.remainingEstimateMinutes === 135, 'parent remaining estimate rolls up to 135');

    const directEdit = await call(token, 'PATCH', `/tasks/${parent.id}`, { remainingEstimateMinutes: 999 });
    assert(directEdit.status === 400, 'direct estimate edit on a rolled-up parent is rejected', String(directEdit.status));

    // Archiving a child removes its minutes from the rollup exactly once.
    const lastChildId = afterChildren.body.subtasks.at(-1).id;
    const archived = await call(token, 'POST', `/tasks/${lastChildId}/archive`, undefined);
    assert(archived.status === 201 || archived.status === 200, 'last child archived', String(archived.status));
    const afterArchive = await call(token, 'GET', `/tasks/${parent.id}`);
    assert(afterArchive.body.baselineEstimateMinutes === 120, 'rollup recalculates after a child is removed', String(afterArchive.body.baselineEstimateMinutes));

    for (const s of afterChildren.body.subtasks) await call(token, 'DELETE', `/tasks/${s.id}`).catch(() => {});
    await call(token, 'DELETE', `/tasks/${parent.id}`);
  } finally {
    if (workspace?.id) await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} task rollup smoke assertion(s) failed`);
  console.log('Task rollup smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
