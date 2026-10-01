#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers accountable planning fields, evidence submission, reviewer acceptance,
// return reasons, status gates, history retention and cleanup.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const OWNER = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
};
const REVIEWER = {
  email: process.env.SEED_ADMIN2_EMAIL ?? 'admin2@example.com',
  password: process.env.SEED_ADMIN2_PASSWORD ?? 'admin2_12345',
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
  const reviewerLogin = await login(REVIEWER);
  const ownerToken = ownerLogin.accessToken;
  const reviewerToken = reviewerLogin.accessToken;

  const wsResult = await call(ownerToken, 'POST', '/workspaces', { name: `Review Smoke ${Date.now()}` });
  assert(wsResult.status === 201, 'workspace created', JSON.stringify(wsResult.body));
  const workspace = wsResult.body;
  try {
    const members = await call(ownerToken, 'POST', `/workspaces/${workspace.id}/members`, { add: [ownerLogin.user.id, reviewerLogin.user.id] });
    assert(members.status === 201, 'owner and reviewer added to workspace', String(members.status));
    const projects = await call(ownerToken, 'GET', `/workspaces/${workspace.id}/projects`);
    const project = projects.body?.[0];
    assert(Boolean(project), 'default project available');

    const created = await call(ownerToken, 'POST', `/workspaces/${workspace.id}/tasks`, {
      projectId: project.id,
      title: 'Evidence review smoke task',
      status: 'IN_PROGRESS',
      ownerId: ownerLogin.user.id,
      reviewerId: reviewerLogin.user.id,
      assigneeIds: [ownerLogin.user.id],
      baselineEstimateMinutes: 60,
      currentEstimateMinutes: 75,
      remainingEstimateMinutes: 15,
    });
    assert(created.status === 201, 'review-controlled task created', JSON.stringify(created.body));
    const task = created.body;
    assert(task.baselineEstimateMinutes === 60 && task.remainingEstimateMinutes === 15, 'planning estimates round-trip');

    const bypass = await call(ownerToken, 'PATCH', `/tasks/${task.id}`, { status: 'DONE' });
    assert(bypass.status === 400, 'direct Done transition is blocked');

    const evidence = await call(ownerToken, 'POST', `/tasks/${task.id}/attachments/links`, {
      url: 'https://example.com/evidence', title: 'Smoke evidence',
    });
    assert(evidence.status === 201, 'evidence link attached', JSON.stringify(evidence.body));

    const submitted = await call(ownerToken, 'POST', `/tasks/${task.id}/submissions`, {
      evidenceAttachmentId: evidence.body.id, note: 'First delivery is ready.',
    });
    assert(submitted.status === 201 && submitted.body.status === 'PENDING', 'task submitted with evidence');
    const duplicate = await call(ownerToken, 'POST', `/tasks/${task.id}/submissions`, {
      evidenceAttachmentId: evidence.body.id, note: 'Duplicate delivery',
    });
    assert(duplicate.status === 400, 'second pending submission rejected');
    const deleteEvidence = await call(ownerToken, 'DELETE', `/tasks/${task.id}/attachments/${evidence.body.id}`);
    assert(deleteEvidence.status === 400, 'submitted evidence cannot be deleted');

    const accepted = await call(reviewerToken, 'POST', `/tasks/${task.id}/submissions/${submitted.body.id}/review`, { decision: 'ACCEPTED', note: 'Approved.' });
    assert(accepted.status === 201 && accepted.body.status === 'ACCEPTED', 'assigned reviewer accepts');
    const afterAccept = await call(ownerToken, 'GET', `/tasks/${task.id}`);
    assert(afterAccept.body.status === 'DONE', 'acceptance completes task');

    await call(ownerToken, 'PATCH', `/tasks/${task.id}`, { status: 'IN_PROGRESS' });
    const resubmitted = await call(ownerToken, 'POST', `/tasks/${task.id}/submissions`, {
      evidenceAttachmentId: evidence.body.id, note: 'Second delivery is ready.',
    });
    const noReason = await call(reviewerToken, 'POST', `/tasks/${task.id}/submissions/${resubmitted.body.id}/review`, { decision: 'RETURNED' });
    assert(noReason.status === 400, 'return without reason rejected');
    const returned = await call(reviewerToken, 'POST', `/tasks/${task.id}/submissions/${resubmitted.body.id}/review`, { decision: 'RETURNED', note: 'Please include the approval page.' });
    assert(returned.status === 201 && returned.body.status === 'RETURNED', 'reviewer returns with reason');
    const afterReturn = await call(ownerToken, 'GET', `/tasks/${task.id}`);
    assert(afterReturn.body.status === 'IN_PROGRESS', 'returned task moves to In Progress');

    const submissions = await call(ownerToken, 'GET', `/tasks/${task.id}/submissions`);
    assert(submissions.body?.length === 2, 'both submission versions retained');
    const history = await call(ownerToken, 'GET', `/tasks/${task.id}/history`);
    assert(history.body?.filter((h) => h.action === 'SUBMITTED').length === 2, 'two submissions audited');
    assert(history.body?.filter((h) => h.action === 'REVIEWED').length === 2, 'two decisions audited');

    await call(ownerToken, 'DELETE', `/tasks/${task.id}`);
  } finally {
    if (workspace?.id) await call(ownerToken, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: true });
  }
  if (failures) throw new Error(`${failures} review smoke assertion(s) failed`);
  console.log('Review workflow smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
