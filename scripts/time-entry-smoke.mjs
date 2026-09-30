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

    // Pause / resume
    const pStart = await call(token, 'POST', `/tasks/${task.id}/timer/start`, { category: 'EXECUTION' });
    assert(pStart.status === 201, 'timer started for pause test', JSON.stringify(pStart.body));
    const paused = await call(token, 'POST', `/tasks/${task.id}/timer/pause`, undefined);
    assert(paused.status === 201 && paused.body.isPaused === true, 'timer paused', JSON.stringify(paused.body));
    const pausedAgain = await call(token, 'POST', `/tasks/${task.id}/timer/pause`, undefined);
    assert(pausedAgain.status === 400, 'pausing an already-paused timer is rejected', String(pausedAgain.status));
    const resumed = await call(token, 'POST', `/tasks/${task.id}/timer/resume`, undefined);
    assert(resumed.status === 201 && resumed.body.isPaused === false && resumed.body.pausedMs >= 0, 'timer resumed and pause time accumulated', JSON.stringify(resumed.body));
    const resumedAgain = await call(token, 'POST', `/tasks/${task.id}/timer/resume`, undefined);
    assert(resumedAgain.status === 400, 'resuming a running timer is rejected', String(resumedAgain.status));
    await call(token, 'POST', `/tasks/${task.id}/timer/pause`, undefined);
    const stoppedPaused = await call(token, 'POST', `/tasks/${task.id}/timer/stop`, undefined);
    assert(stoppedPaused.status === 201 && stoppedPaused.body.durationMinutes === 1, 'stopping while paused closes the open pause (min 1 minute)', JSON.stringify(stoppedPaused.body));

    // Overlap: interval entries far in the past so they never collide with live timers.
    // Random past day per run: overlap is per-user across tasks, and smoke rows persist.
    const dayOffset = 400 + Math.floor(Math.random() * 3000);
    const dayStart = new Date(Date.UTC(2026, 8, 29) - dayOffset * 86400000);
    const ymd = (d) => d.toISOString().slice(0, 10);
    const base = new Date(dayStart.getTime() + 5 * 3600000);
    const iso = (mins) => new Date(base.getTime() + mins * 60000).toISOString();
    const first = await call(token, 'POST', `/tasks/${task.id}/time-entries`, { workDate: ymd(dayStart), startedAt: iso(0), durationMinutes: 60 });
    assert(first.status === 201, 'interval entry logged', JSON.stringify(first.body));
    const clash = await call(token, 'POST', `/tasks/${task.id}/time-entries`, { workDate: ymd(dayStart), startedAt: iso(30), durationMinutes: 60 });
    assert(clash.status === 400 && /overlap/i.test(JSON.stringify(clash.body)), 'overlapping entry is rejected', JSON.stringify(clash.body));
    const b2b = await call(token, 'POST', `/tasks/${task.id}/time-entries`, { workDate: ymd(dayStart), startedAt: iso(60), durationMinutes: 30 });
    assert(b2b.status === 201, 'back-to-back entry is allowed', JSON.stringify(b2b.body));
    const future = await call(token, 'POST', `/tasks/${task.id}/time-entries`, { workDate: '2030-01-01', startedAt: '2030-01-01T05:00:00.000Z', durationMinutes: 30 });
    assert(future.status === 400, 'time in the future cannot be logged', String(future.status));

    const istMidnight = dayStart.getTime() + 2 * 86400000 - 5.5 * 3600000; // 00:00 IST starting local day D+2
    const crossStart = new Date(istMidnight - 30 * 60000);
    const dayOne = ymd(new Date(dayStart.getTime() + 86400000));
    const dayTwo = ymd(new Date(dayStart.getTime() + 2 * 86400000));
    // Cross-midnight (office tz Asia/Kolkata): 23:30 IST -> 00:45 IST = 18:00Z -> 19:15Z
    const cross = await call(token, 'POST', `/tasks/${task.id}/time-entries`, { workDate: dayOne, startedAt: crossStart.toISOString(), durationMinutes: 75 });
    assert(cross.status === 201 && cross.body.parts?.length === 2, 'cross-midnight entry splits into two day rows', JSON.stringify(cross.body));
    if (cross.body.parts?.length === 2) {
      const [d1, d2] = cross.body.parts;
      assert(d1.workDate === dayOne && d1.durationMinutes === 30 && d2.workDate === dayTwo && d2.durationMinutes === 45, 'split books 30m to day one and 45m to day two', JSON.stringify(cross.body.parts.map((x) => [x.workDate, x.durationMinutes])));
    }
    const summary2 = await call(token, 'GET', `/tasks/${task.id}/time-entries`);
    assert(summary2.body.actualEffortMinutes === 45 + 1 + 1 + 60 + 30 + 75, 'effort total includes every part exactly once', String(summary2.body.actualEffortMinutes));

    await call(token, 'DELETE', `/tasks/${task.id}`);
  } finally {
    if (workspace?.id) await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} time entry smoke assertion(s) failed`);
  console.log('Time entry smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
