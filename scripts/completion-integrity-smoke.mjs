#!/usr/bin/env node
const API = process.env.API_URL ?? 'http://localhost:3000/api';
let failures = 0;
function ok(value, label, detail = '') { if (value) console.log(`PASS ${label}`); else { failures++; console.error(`FAIL ${label}${detail ? ` - ${detail}` : ''}`); } }
async function call(token, method, path, body) {
  const response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
}
async function main() {
  const login = await call(null, 'POST', '/auth/login', { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' });
  const token = login.body.accessToken; const userId = login.body.user.id;
  const ws = await call(token, 'POST', '/workspaces', { name: `Completion Integrity ${Date.now()}` });
  await call(token, 'POST', `/workspaces/${ws.body.id}/members`, { add: [userId] });
  try {
    const projects = await call(token, 'GET', `/workspaces/${ws.body.id}/projects`); const projectId = projects.body[0].id;
    const parent = await call(token, 'POST', `/workspaces/${ws.body.id}/tasks`, { projectId, title: 'Audited split parent', ownerId: userId, baselineEstimateMinutes: 120, currentEstimateMinutes: 120, remainingEstimateMinutes: 75, acceptanceCriteria: 'All allocated work remains traceable.', childScope: 'REQUIRED' });
    ok(parent.status === 201 && parent.body.acceptanceCriteria, 'acceptance criteria and required scope persist', JSON.stringify(parent.body));
    const logged = await call(token, 'POST', `/tasks/${parent.body.id}/time-entries`, { workDate: '2026-09-28', durationMinutes: 45, category: 'EXECUTION', note: 'Existing work' });
    const child = await call(token, 'POST', `/workspaces/${ws.body.id}/tasks`, { projectId, parentTaskId: parent.body.id, title: 'Allocated child', ownerId: userId, baselineEstimateMinutes: 20, currentEstimateMinutes: 20, remainingEstimateMinutes: 0, acceptanceCriteria: 'Allocated work is complete.' });
    const moved = await call(token, 'POST', `/tasks/${parent.body.id}/time-entries/${logged.body.id}/allocate`, { targetTaskId: child.body.id, durationMinutes: 20, reason: 'Split existing work by outcome' });
    ok(moved.status === 201 && moved.body.totalMinutesPreserved, 'AT20 allocation operation succeeds and reports preservation', JSON.stringify(moved.body));
    const [parentTime, childTime] = await Promise.all([call(token, 'GET', `/tasks/${parent.body.id}/time-entries`), call(token, 'GET', `/tasks/${child.body.id}/time-entries`)]);
    ok(parentTime.body.actualEffortMinutes + childTime.body.actualEffortMinutes === 45, 'AT20 logged minutes exist exactly once after split');
    const revision = await call(token, 'POST', `/tasks/${child.body.id}/estimate-revisions`, { revisedEstimateMinutes: 50, reason: 'Client added validation scope', classification: 'CLIENT_CHANGE' });
    ok(revision.status === 201 && revision.body.previousEstimateMinutes === 20 && revision.body.revisedEstimateMinutes === 50, 'AT09/AT13 scope revision is classified and preserves baseline');
    const done = await call(token, 'POST', `/workspaces/${ws.body.id}/tasks`, { projectId, title: 'Reopenable outcome', status: 'DONE', ownerId: userId, acceptanceCriteria: 'Approved result.' });
    const missingReason = await call(token, 'POST', `/tasks/${done.body.id}/reopen`, {});
    ok(missingReason.status === 400, 'reopening without a reason is rejected');
    const reopened = await call(token, 'POST', `/tasks/${done.body.id}/reopen`, { reason: 'Accepted output needs a documented correction' });
    ok(reopened.status === 201 && reopened.body.reason, 'accepted task reopening is reasoned and recorded');
    const history = await call(token, 'GET', `/tasks/${parent.body.id}/history`);
    ok(history.body.some((row) => row.action === 'TIME_ENTRY_UPDATED'), 'time allocation is present in audit history');
  } finally { await call(token, 'PATCH', `/workspaces/${ws.body.id}`, { isArchived: true }); }
  if (failures) throw new Error(`${failures} completion-integrity assertion(s) failed`);
  console.log('Completion integrity smoke passed.');
}
main().catch((error) => { console.error(error); process.exit(1); });
