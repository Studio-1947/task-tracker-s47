#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers working-time-aware overdue ageing (PRD §2 "Preserve commitments
// while measuring working time", AT03/AT05): the due date itself is never
// moved, only a derived working-minutes-overdue figure is computed from it.

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

  const wsResult = await call(token, 'POST', '/workspaces', { name: `Ageing Smoke ${Date.now()}` });
  assert(wsResult.status === 201, 'workspace created', JSON.stringify(wsResult.body));
  const workspace = wsResult.body;
  try {
    const projects = await call(token, 'GET', `/workspaces/${workspace.id}/projects`);
    const project = projects.body?.[0];
    assert(Boolean(project), 'default project available');

    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const inTenDays = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();

    const overdue = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, {
      projectId: project.id, title: 'Overdue ageing task', dueDate: threeDaysAgo,
    });
    assert(overdue.status === 201, 'overdue task created', JSON.stringify(overdue.body));
    assert(overdue.body.dueDate === new Date(threeDaysAgo).toISOString(), 'due date is preserved verbatim, not shifted');
    assert(typeof overdue.body.overdueWorkingMinutes === 'number', 'overdue task reports a numeric working-minutes figure', String(overdue.body.overdueWorkingMinutes));
    assert(overdue.body.overdueWorkingMinutes >= 0, 'overdue working minutes is non-negative');
    const wallClockMinutes = Math.floor((now - new Date(threeDaysAgo).getTime()) / 60000);
    assert(
      overdue.body.overdueWorkingMinutes <= wallClockMinutes,
      'working-time ageing never exceeds raw wall-clock elapsed time (weekends/off-hours excluded)',
      `${overdue.body.overdueWorkingMinutes} > ${wallClockMinutes}`,
    );

    const notYetDue = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, {
      projectId: project.id, title: 'Future deadline task', dueDate: inTenDays,
    });
    assert(notYetDue.body.overdueWorkingMinutes === null, 'a future due date is not overdue');

    // A task accepted (DONE) is no longer overdue even though its due date has passed.
    const doneTask = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, {
      projectId: project.id, title: 'Completed late task', dueDate: threeDaysAgo, status: 'DONE',
    });
    assert(doneTask.status === 201, 'completed task created directly as Done', JSON.stringify(doneTask.body));
    assert(doneTask.body.overdueWorkingMinutes === null, 'a completed task is never reported as overdue');

    await call(token, 'DELETE', `/tasks/${overdue.body.id}`);
    await call(token, 'DELETE', `/tasks/${notYetDue.body.id}`);
    await call(token, 'DELETE', `/tasks/${doneTask.body.id}`);
  } finally {
    if (workspace?.id) await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: true });
  }
  if (failures) throw new Error(`${failures} task ageing smoke assertion(s) failed`);
  console.log('Task ageing smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
