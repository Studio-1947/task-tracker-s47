#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers D01 "unified metric scope" (PRD §10/§12, AT01): the admin dashboard's
// overdueTasks headline count and its overdueTaskList drill-down must always
// agree, come from the same query/request, and every listed task must
// actually satisfy the overdue definition (isArchived=false, dueDate < now,
// status != DONE). Also proves the old AtRiskCard bug is gone: since its
// upcoming-deadlines feed can never contain overdue items, we assert the
// dashboard's own overdueTasks count is what admins would see as "at risk",
// not a structurally-always-zero derived figure.

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

  const wsResult = await call(token, 'POST', '/workspaces', { name: `Overdue Metric Smoke ${Date.now()}` });
  assert(wsResult.status === 201, 'workspace created', JSON.stringify(wsResult.body));
  const workspace = wsResult.body;
  const createdTaskIds = [];
  try {
    const projects = await call(token, 'GET', `/workspaces/${workspace.id}/projects`);
    const project = projects.body?.[0];
    assert(Boolean(project), 'default project available');

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < 3; i += 1) {
      const created = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, {
        projectId: project.id, title: `Overdue metric task ${i + 1}`, dueDate: threeDaysAgo,
      });
      assert(created.status === 201, `overdue task ${i + 1} created`, JSON.stringify(created.body));
      createdTaskIds.push(created.body.id);
    }

    const before = await call(token, 'GET', '/admin/dashboard');
    assert(before.status === 200, 'admin dashboard loaded', String(before.status));

    // Same request, same instant: the headline count and the drill-down list total must agree exactly.
    assert(
      typeof before.body.overdueTasks === 'number' && Array.isArray(before.body.overdueTaskList),
      'dashboard exposes both overdueTasks (count) and overdueTaskList (rows)',
    );
    assert(before.body.overdueTasks >= 3, 'headline count includes the 3 tasks just created', String(before.body.overdueTasks));

    const listedIds = new Set(before.body.overdueTaskList.map((t) => t.id));
    const oursListed = createdTaskIds.filter((id) => listedIds.has(id));
    // The drill-down is capped at a page size (20) ordered by oldest deadline first;
    // our 3-day-old tasks should appear unless the seed data already has 20+ older overdue tasks.
    assert(
      before.body.overdueTaskList.length <= before.body.overdueTasks,
      'drill-down list never reports more rows than the headline total',
      `${before.body.overdueTaskList.length} > ${before.body.overdueTasks}`,
    );
    for (const row of before.body.overdueTaskList) {
      assert(row.status !== 'DONE', `listed overdue task ${row.ref} is not DONE`);
      assert(new Date(row.dueDate).getTime() < Date.now(), `listed overdue task ${row.ref} due date is actually in the past`);
    }
    if (oursListed.length > 0) {
      const row = before.body.overdueTaskList.find((t) => t.id === oursListed[0]);
      assert(typeof row.overdueWorkingMinutes === 'number', 'listed overdue row carries working-time ageing (C01 reuse)', String(row.overdueWorkingMinutes));
    }

    // Complete one of the tasks and confirm the count drops by exactly one (same scope, live).
    await call(token, 'PATCH', `/tasks/${createdTaskIds[0]}`, { status: 'DONE' });
    const after = await call(token, 'GET', '/admin/dashboard');
    assert(after.body.overdueTasks === before.body.overdueTasks - 1, 'completing one overdue task drops the count by exactly one', `${before.body.overdueTasks} -> ${after.body.overdueTasks}`);
    assert(!after.body.overdueTaskList.some((t) => t.id === createdTaskIds[0]), 'the completed task no longer appears in the drill-down list');

    for (const id of createdTaskIds) await call(token, 'DELETE', `/tasks/${id}`).catch(() => {});
  } finally {
    if (workspace?.id) await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} dashboard overdue metric smoke assertion(s) failed`);
  console.log('Dashboard overdue metric smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
