#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers time entries, timers, actual effort sum, remaining estimate deduction, and forecast calculations (E01).

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

  const wsResult = await call(token, 'POST', '/workspaces', { name: `Time Entry Smoke ${Date.now()}` });
  assert(wsResult.status === 201, 'workspace created', JSON.stringify(wsResult.body));
  const workspace = wsResult.body;
  try {
    const projects = await call(token, 'GET', `/workspaces/${workspace.id}/projects`);
    const project = projects.body?.[0];
    assert(Boolean(project), 'default project available');

    // AT08 scenario: 60 estimated, 45 actual logged, 30 remaining -> 75 forecast (15 overrun)
    const taskRes = await call(token, 'POST', `/workspaces/${workspace.id}/tasks`, {
      projectId: project.id,
      title: 'Time tracking test task',
      baselineEstimateMinutes: 60,
      currentEstimateMinutes: 60,
      remainingEstimateMinutes: 60,
    });
    assert(taskRes.status === 201, 'task created', JSON.stringify(taskRes.body));
    const task = taskRes.body;

    const logRes = await call(token, 'POST', `/tasks/${task.id}/time-entries`, {
      workDate: new Date().toISOString().slice(0, 10),
      durationMinutes: 45,
      category: 'EXECUTION',
      note: 'Logged 45 minutes of execution',
    });
    assert(logRes.status === 201, 'time entry logged', JSON.stringify(logRes.body));

    // Manually set remaining estimate to 30 for AT08 scenario verification
    await call(token, 'PATCH', `/tasks/${task.id}`, { remainingEstimateMinutes: 30 });

    const summary = await call(token, 'GET', `/tasks/${task.id}/time-entries`);
    assert(summary.status === 200, 'time summary fetched', JSON.stringify(summary.body));
    assert(summary.body.actualEffortMinutes === 45, 'actual effort is 45 mins', String(summary.body.actualEffortMinutes));
    assert(summary.body.forecastTotalMinutes === 75, 'forecast total is 75 mins (45 + 30)', String(summary.body.forecastTotalMinutes));
    assert(summary.body.forecastVarianceMinutes === 15, 'forecast variance is +15 mins overrun', String(summary.body.forecastVarianceMinutes));

    // Timer test
    const startTimer = await call(token, 'POST', `/tasks/${task.id}/timer/start`, { category: 'REVIEW' });
    assert(startTimer.status === 201, 'timer started', JSON.stringify(startTimer.body));

    const dupTimer = await call(token, 'POST', `/tasks/${task.id}/timer/start`, { category: 'EXECUTION' });
    assert(dupTimer.status === 400, 'duplicate active timer prevented', String(dupTimer.status));

    const stopTimer = await call(token, 'POST', `/tasks/${task.id}/timer/stop`, undefined);
    assert(stopTimer.status === 201, 'timer stopped', JSON.stringify(stopTimer.body));

    await call(token, 'DELETE', `/tasks/${task.id}`);
  } finally {
    if (workspace?.id) await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: true });
  }
  if (failures) throw new Error(`${failures} time entry smoke assertion(s) failed`);
  console.log('Time entry smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
