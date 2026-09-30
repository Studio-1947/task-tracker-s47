#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers the workspace-scoped MANAGER role (PRD §9 "Team manager", A01):
// a manager can decide any submission in their assigned workspace even when
// not the task's literal assigned reviewer, a plain member cannot, the role
// is scoped to that one workspace only, and only an admin can grant it.

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
  const adminLogin = await login(OWNER);
  const admin = adminLogin.accessToken;
  const reviewerLogin = await login(REVIEWER);

  // Create a true plain member account to accurately test workspace MANAGER vs MEMBER permissions.
  const plainEmail = `plain_mgr_${Date.now()}@example.com`;
  const plainCreated = await call(admin, 'POST', '/users', { name: 'Plain Member', email: plainEmail, role: 'MEMBER' });
  const secondLogin = await call(null, 'POST', '/auth/login', { email: plainEmail, password: plainCreated.body.tempPassword });
  const second = secondLogin.body.accessToken;
  const secondId = secondLogin.body.user.id;

  const wsA = await call(admin, 'POST', '/workspaces', { name: `Manager Smoke A ${Date.now()}` });
  const wsB = await call(admin, 'POST', '/workspaces', { name: `Manager Smoke B ${Date.now()}` });
  assert(wsA.status === 201 && wsB.status === 201, 'two workspaces created');
  const workspaceA = wsA.body;
  const workspaceB = wsB.body;
  try {
    await call(admin, 'POST', `/workspaces/${workspaceA.id}/members`, { add: [adminLogin.user.id, reviewerLogin.user.id, secondId] });
    await call(admin, 'POST', `/workspaces/${workspaceB.id}/members`, { add: [adminLogin.user.id, reviewerLogin.user.id, secondId] });

    // Not yet a manager anywhere.
    const notYetManager = await call(admin, 'PATCH', `/workspaces/${workspaceA.id}/members/${secondId}/role`, { role: 'MEMBER' });
    assert(notYetManager.status === 200, 'role no-op accepted (already MEMBER)', JSON.stringify(notYetManager.body));

    const projectsA = await call(admin, 'GET', `/workspaces/${workspaceA.id}/projects`);
    const projectA = projectsA.body?.[0];
    const projectsB = await call(admin, 'GET', `/workspaces/${workspaceB.id}/projects`);
    const projectB = projectsB.body?.[0];

    // A reviewer-controlled task in workspace A, reviewer = admin (not `second`).
    const taskA = await call(admin, 'POST', `/workspaces/${workspaceA.id}/tasks`, {
      projectId: projectA.id, title: 'Manager review scope task', status: 'IN_PROGRESS',
      ownerId: adminLogin.user.id, reviewerId: reviewerLogin.user.id, assigneeIds: [adminLogin.user.id],
    });
    assert(taskA.status === 201, 'workspace A review task created', JSON.stringify(taskA.body));
    const evidenceA = await call(admin, 'POST', `/tasks/${taskA.body.id}/attachments/links`, { url: 'https://example.com/a', title: 'Evidence A' });
    assert(evidenceA.status === 201, 'workspace A evidence attached', JSON.stringify(evidenceA.body));
    const submissionA = await call(admin, 'POST', `/tasks/${taskA.body.id}/submissions`, { evidenceAttachmentId: evidenceA.body.id, note: 'Ready.' });
    assert(submissionA.status === 201, 'submission A created', JSON.stringify(submissionA.body));

    // Plain member cannot decide it (not the assigned reviewer, not a manager).
    const memberAttempt = await call(second, 'POST', `/tasks/${taskA.body.id}/submissions/${submissionA.body.id}/review`, { decision: 'ACCEPTED', note: 'ok' });
    assert(memberAttempt.status === 403, 'a plain member cannot decide a submission they are not the reviewer for', String(memberAttempt.status));

    // Promote to MANAGER in workspace A only.
    const promoted = await call(admin, 'PATCH', `/workspaces/${workspaceA.id}/members/${secondId}/role`, { role: 'MANAGER' });
    assert(promoted.status === 200 && promoted.body.role === 'MANAGER', 'admin promotes member to MANAGER in workspace A', JSON.stringify(promoted.body));

    const membersA = await call(admin, 'GET', `/workspaces/${workspaceA.id}/members`);
    const secondRow = membersA.body.find((m) => m.id === secondId);
    assert(secondRow?.workspaceRole === 'MANAGER', 'member list reflects the workspace-scoped role', JSON.stringify(secondRow));

    // Manager (not the literal reviewer) can now decide the submission.
    const managerDecision = await call(second, 'POST', `/tasks/${taskA.body.id}/submissions/${submissionA.body.id}/review`, { decision: 'ACCEPTED', note: 'Approved as workspace manager.' });
    assert(managerDecision.status === 201 && managerDecision.body.status === 'ACCEPTED', 'workspace manager can decide a submission they were not explicitly assigned as reviewer for', JSON.stringify(managerDecision.body));

    // The role is scoped to workspace A only — same person, workspace B, still just a member.
    const taskB = await call(admin, 'POST', `/workspaces/${workspaceB.id}/tasks`, {
      projectId: projectB.id, title: 'Scope isolation task', status: 'IN_PROGRESS',
      ownerId: adminLogin.user.id, reviewerId: reviewerLogin.user.id, assigneeIds: [adminLogin.user.id],
    });
    assert(taskB.status === 201, 'workspace B review task created', JSON.stringify(taskB.body));
    const evidenceB = await call(admin, 'POST', `/tasks/${taskB.body.id}/attachments/links`, { url: 'https://example.com/b', title: 'Evidence B' });
    assert(evidenceB.status === 201, 'workspace B evidence attached', JSON.stringify(evidenceB.body));
    const submissionB = await call(admin, 'POST', `/tasks/${taskB.body.id}/submissions`, { evidenceAttachmentId: evidenceB.body.id, note: 'Ready.' });
    assert(submissionB.status === 201, 'submission B created', JSON.stringify(submissionB.body));
    const crossWorkspaceAttempt = await call(second, 'POST', `/tasks/${taskB.body.id}/submissions/${submissionB.body.id}/review`, { decision: 'ACCEPTED', note: 'should fail' });
    assert(crossWorkspaceAttempt.status === 403, 'the MANAGER role does not carry over to a different workspace', String(crossWorkspaceAttempt.status));

    // Only an admin can grant the role — the newly-minted manager cannot self-serve further grants.
    const selfGrantAttempt = await call(second, 'PATCH', `/workspaces/${workspaceA.id}/members/${secondId}/role`, { role: 'MANAGER' });
    assert(selfGrantAttempt.status === 403, 'a non-admin (even a manager) cannot call the role-assignment endpoint', String(selfGrantAttempt.status));

    // Audit trail recorded the promotion.
    const history = await call(admin, 'GET', `/workspaces/${workspaceA.id}/activity`).catch(() => ({ status: 0 }));
    if (history.status === 200) {
      assert(history.body?.some((h) => h.action === 'WORKSPACE_ROLE_CHANGED'), 'role change is audited');
    }

    await call(admin, 'DELETE', `/tasks/${taskA.body.id}`).catch(() => {});
    await call(admin, 'DELETE', `/tasks/${taskB.body.id}`).catch(() => {});
  } finally {
    if (workspaceA?.id) await call(admin, 'PATCH', `/workspaces/${workspaceA.id}`, { isArchived: false });
    if (workspaceB?.id) await call(admin, 'PATCH', `/workspaces/${workspaceB.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} workspace manager smoke assertion(s) failed`);
  console.log('Workspace manager smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
