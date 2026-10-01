#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers the shared metric layer: numerator/denominator/task ids for every
// metric, original vs revised commitment views, top-level vs subtask scope,
// legacy exclusion, and exact reconciliation of the CSV exports to the JSON.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };
const REVIEWER = { email: process.env.SEED_ADMIN2_EMAIL ?? 'admin2@example.com', password: process.env.SEED_ADMIN2_PASSWORD ?? 'admin2_12345' };

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
  return { status: res.status, body: parsed, text };
}
async function login(a) {
  const r = await call(null, 'POST', '/auth/login', a);
  if (!r.body?.accessToken) throw new Error(`Login failed for ${a.email}`);
  return r.body;
}
const iso = (ms) => new Date(ms).toISOString();

/** Minimal CSV reader (quoted cells, doubled quotes) for the export under test. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function main() {
  const admin = await login(ADMIN);
  const reviewer = await login(REVIEWER);
  const t = admin.accessToken;
  const now = Date.now();

  const ws = await call(t, 'POST', '/workspaces', { name: `Metrics Smoke ${now}` });
  assert(ws.status === 201, 'workspace created', JSON.stringify(ws.body));
  try {
    await call(t, 'POST', `/workspaces/${ws.body.id}/members`, { add: [admin.user.id, reviewer.user.id] });
    const projects = await call(t, 'GET', `/workspaces/${ws.body.id}/projects`);
    const projectId = projects.body[0].id;
    const mk = (extra) => call(t, 'POST', `/workspaces/${ws.body.id}/tasks`, { projectId, ownerId: admin.user.id, reviewerId: reviewer.user.id, assigneeIds: [admin.user.id], acceptanceCriteria: 'Accepted.', ...extra });
    const submit = async (taskId, note) => {
      const ev = await call(t, 'POST', `/tasks/${taskId}/attachments/links`, { url: `https://example.com/${taskId}/${Math.random()}`, title: 'Evidence' });
      return call(t, 'POST', `/tasks/${taskId}/submissions`, { evidenceAttachmentId: ev.body.id, note });
    };
    const decide = (taskId, subId, decision, note) => call(reviewer.accessToken, 'POST', `/tasks/${taskId}/submissions/${subId}/review`, { decision, note });

    // T1: submitted and accepted before its due date, first pass.
    const t1 = await mk({ title: 'T1 on time', status: 'IN_PROGRESS', dueDate: iso(now + 6 * 3600000) });
    const s1 = await submit(t1.body.id, 'done'); await decide(t1.body.id, s1.body.id, 'ACCEPTED');
    // T2: due an hour ago; returned once, then accepted (late, not first pass).
    const t2 = await mk({ title: 'T2 late', status: 'IN_PROGRESS', dueDate: iso(now - 3600000) });
    const s2 = await submit(t2.body.id, 'first try'); await decide(t2.body.id, s2.body.id, 'RETURNED', 'needs work');
    const s2b = await submit(t2.body.id, 'second try'); await decide(t2.body.id, s2b.body.id, 'ACCEPTED');
    // T3: due two hours ago, still open, in progress with an owner.
    const t3 = await mk({ title: 'T3 overdue', status: 'IN_PROGRESS', dueDate: iso(now - 2 * 3600000) });
    await call(t, 'POST', `/tasks/${t3.body.id}/comments`, { body: 'Progress update today' });
    // Subtask of T3: must never be combined with parent counts.
    const child = await call(t, 'POST', `/tasks/${t3.body.id}/subtasks`, { title: 'T3 child' });
    // Legacy: accepted with no recorded submission (no reviewer, so it can be set DONE directly).
    const legacy = await call(t, 'POST', `/workspaces/${ws.body.id}/tasks`, { projectId, title: 'Legacy done', status: 'DONE' });
    assert([t1, t2, t3, child, legacy].every((x) => x.status === 201), 'fixture tasks created', JSON.stringify([t1.status, t2.status, t3.status, child.status, legacy.status]));

    // Rework, scope change, allocation.
    const today = iso(now).slice(0, 10);
    await call(t, 'POST', `/tasks/${t3.body.id}/time-entries`, { workDate: today, durationMinutes: 30, category: 'REWORK' });
    await call(t, 'POST', `/tasks/${t3.body.id}/time-entries`, { workDate: today, durationMinutes: 90, category: 'EXECUTION' });
    await call(t, 'POST', `/tasks/${t3.body.id}/estimate-revisions`, { revisedEstimateMinutes: 240, reason: 'Client added a section', classification: 'SCOPE_CHANGE' });
    await call(t, 'POST', `/workspaces/${ws.body.id}/capacity-allocations`, { userId: admin.user.id, taskId: t3.body.id, periodStart: today, periodEnd: today, allocatedMinutes: 60 });

    const q = `workspaceId=${ws.body.id}&from=${encodeURIComponent(iso(now - 86400000))}&to=${encodeURIComponent(iso(now + 86400000))}`;
    const res = await call(t, 'GET', `/metrics/workspace?${q}`);
    const m = res.body;
    assert(res.status === 200 && m.scope.metricVersion && m.scope.generatedAt, 'metrics carry scope, generated time and metric version', JSON.stringify(m.scope));
    assert(m.scope.topLevelTasks === 4 && m.scope.subtasksExcluded === 1, 'parent and subtask counts are kept apart', JSON.stringify(m.scope));
    assert(m.openTasks.count === 1 && m.openTasks.taskIds[0] === t3.body.id, 'open tasks = the one unaccepted top-level task, with its id');
    assert(m.overdueCommitments.count === 1 && m.overdueCommitments.taskIds[0] === t3.body.id, 'overdue commitments count and ids agree');
    assert(m.onTimeSubmission.numerator === 1 && m.onTimeSubmission.denominator === 3 && m.onTimeSubmission.taskIds[0] === t1.body.id, 'on-time submission 1/3 with drill-down id', JSON.stringify(m.onTimeSubmission));
    assert(m.onTimeAcceptance.numerator === 1 && m.onTimeAcceptance.denominator === 3, 'on-time acceptance 1/3', JSON.stringify(m.onTimeAcceptance));
    assert(m.firstPassAcceptance.numerator === 1 && m.firstPassAcceptance.denominator === 2 && m.firstPassAcceptance.percentage === 50, 'first-pass acceptance 1/2 counts first decisions only', JSON.stringify(m.firstPassAcceptance));
    assert(m.reviewTurnaround.sampleSize === 3 && m.reviewTurnaround.medianMinutes !== null, 'review turnaround reports sample size with median and p90', JSON.stringify(m.reviewTurnaround));
    assert(m.legacyUnverified.count === 1 && m.legacyUnverified.taskIds[0] === legacy.body.id, 'legacy acceptance is excluded and listed, not back-filled');
    assert(m.reworkEffort.reworkMinutes === 30 && m.reworkEffort.totalMinutes === 120 && m.reworkEffort.percentage === 25, 'rework effort 30 of 120 minutes', JSON.stringify(m.reworkEffort));
    assert(m.reworkEffort.returnedSubmissions.count === 1 && m.reworkEffort.returnedSubmissions.taskIds[0] === t2.body.id, 'returned submissions listed with task id');
    assert(m.scopeChanges.count === 1 && m.scopeChanges.byClassification.SCOPE_CHANGE === 1, 'scope changes are reported separately from rework', JSON.stringify(m.scopeChanges));
    assert(m.plannedUtilisation.allocatedMinutes >= 60 && (m.plannedUtilisation.notApplicable || m.plannedUtilisation.percentage !== null), 'planned utilisation includes allocations and handles zero capacity', JSON.stringify(m.plannedUtilisation));
    assert(m.updateDiscipline.notApplicable ? m.updateDiscipline.denominator === 0 : m.updateDiscipline.numerator <= m.updateDiscipline.denominator && m.updateDiscipline.numerator >= 1, 'update discipline reports days with a meaningful update', JSON.stringify(m.updateDiscipline));
    assert(m.reconciliation.consistent && m.reconciliation.statusBreakdown.DONE === 3, 'status breakdown reconciles to the top-level total', JSON.stringify(m.reconciliation));

    // Original vs revised commitment: moving the date must not erase the missed promise.
    const moved = await call(t, 'PATCH', `/tasks/${t3.body.id}`, { dueDate: iso(now + 2 * 86400000), dueDateReason: 'Smoke: client moved the date' });
    assert(moved.status === 200, 'due date revised', JSON.stringify(moved.body));
    const original = (await call(t, 'GET', `/metrics/workspace?${q}&basis=ORIGINAL`)).body;
    const revised = (await call(t, 'GET', `/metrics/workspace?${q}&basis=REVISED`)).body;
    assert(original.overdueCommitments.count === 1, 'original-commitment view still shows the missed promise', JSON.stringify(original.overdueCommitments));
    assert(revised.overdueCommitments.count === 0, 'revised-commitment view shows it as no longer overdue', JSON.stringify(revised.overdueCommitments));
    const badBasis = await call(t, 'GET', `/metrics/workspace?${q}&basis=NOPE`);
    assert(badBasis.status === 400, 'unknown basis is rejected', String(badBasis.status));
    const badPeriod = await call(t, 'GET', `/metrics/workspace?workspaceId=${ws.body.id}&from=${encodeURIComponent(iso(now))}&to=${encodeURIComponent(iso(now - 1000))}`);
    assert(badPeriod.status === 400, 'inverted period is rejected with 400', String(badPeriod.status));

    // CSV export reconciles exactly to the JSON it is built from.
    const csv = await call(t, 'GET', `/metrics/workspace.csv?${q}&basis=ORIGINAL`);
    assert(csv.status === 200, 'metrics CSV export downloads', String(csv.status));
    const rows = parseCsv(csv.text);
    const find = (label) => rows.find((r) => r[0] === label);
    const kv = (label) => find(label)?.[1];
    assert(kv('Metric version') === original.scope.metricVersion && kv('Commitment basis')?.startsWith('Original') && !!kv('Generated at') && kv('Workspace id') === ws.body.id, 'CSV states scope, basis, generated time and metric version');
    const num = (label, col = 1) => Number(find(label)?.[col]);
    assert(num('On-time submission') === original.onTimeSubmission.numerator && num('On-time submission', 2) === original.onTimeSubmission.denominator, 'CSV on-time submission equals JSON');
    assert(num('First-pass acceptance') === original.firstPassAcceptance.numerator && num('First-pass acceptance', 2) === original.firstPassAcceptance.denominator, 'CSV first-pass acceptance equals JSON');
    assert(num('Open tasks') === original.openTasks.count && num('Overdue commitments') === original.overdueCommitments.count, 'CSV open and overdue counts equal JSON');
    assert(num('Rework effort (min)') === original.reworkEffort.reworkMinutes && num('Rework effort (min)', 2) === original.reworkEffort.totalMinutes, 'CSV rework minutes equal JSON');
    const drillCount = (label) => rows.filter((r) => r[0] === label && r.length === 5).length;
    assert(drillCount('Open tasks') === original.openTasks.count, 'CSV open-task drill-down lists exactly the counted tasks');
    assert(drillCount('Overdue commitments') === original.overdueCommitments.count, 'CSV overdue drill-down lists exactly the counted tasks');
    assert(drillCount('On-time submission') === original.onTimeSubmission.numerator, 'CSV on-time-submission drill-down lists exactly the counted tasks');
    assert(find('Reconciliation')?.[1] === 'OK', 'CSV reconciliation line reports OK');

    // Permissions: a non-member gets nothing.
    const outsider = await call(t, 'POST', '/users', { name: 'Metrics Outsider', email: `metrics_out_${now}@example.com`, role: 'MEMBER' });
    const o = await login({ email: outsider.body.email, password: outsider.body.tempPassword });
    const denied = await call(o.accessToken, 'GET', `/metrics/workspace?${q}`);
    const deniedCsv = await call(o.accessToken, 'GET', `/metrics/workspace.csv?${q}`);
    assert(denied.status === 403 && deniedCsv.status === 403, 'non-member is refused both the metrics and the export', `${denied.status}/${deniedCsv.status}`);

    // Monthly export is self-consistent and states its scope.
    const month = iso(now).slice(0, 7);
    const monthly = await call(t, 'GET', `/admin/reports/monthly.csv?month=${month}`);
    const mrows = parseCsv(monthly.text);
    const mfind = (label) => mrows.find((r) => r[0] === label);
    const wsRows = mrows.slice(mrows.findIndex((r) => r[0] === 'Workspace') + 1, mrows.findIndex((r) => r[0] === 'Total'));
    const total = mfind('Total');
    assert(monthly.status === 200 && mfind('Reconciliation')?.[1]?.startsWith('OK') && !!mfind('Scope') && !!mfind('Generated at'), 'monthly CSV states scope, generated time and reconciliation');
    assert(wsRows.reduce((s, r) => s + Number(r[1]), 0) === Number(total?.[1]) && Number(total?.[1]) === Number(mfind('Created')?.[1]), 'monthly workspace rows sum exactly to the created total');
    assert(wsRows.reduce((s, r) => s + Number(r[3]), 0) === Number(total?.[3]) && Number(total?.[3]) === Number(mfind('Overdue at month end')?.[1]), 'monthly workspace overdue sums exactly to the overdue total');
    const statusCounts = mfind('Status counts')?.[1] ?? '';
    assert(/IN_REVIEW=\d+/.test(statusCounts), 'monthly status counts include In review', statusCounts);
  } finally {
    if (ws.body?.id) await call(t, 'PATCH', `/workspaces/${ws.body.id}`, { isArchived: true });
  }
  if (failures) throw new Error(`${failures} metrics smoke assertion(s) failed`);
  console.log('Metrics reconciliation smoke passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
