#!/usr/bin/env node

const API = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' };
let failures = 0;
const ok = (condition, message, extra = '') => condition ? console.log(`PASS ${message}`) : (failures++, console.error(`FAIL ${message}${extra ? ` - ${extra}` : ''}`));

async function call(token, method, path, body) {
  const response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  try { return { status: response.status, body: text ? JSON.parse(text) : null }; }
  catch { return { status: response.status, body: text }; }
}

async function login(email, password) {
  const result = await call(null, 'POST', '/auth/login', { email, password });
  if (!result.body?.accessToken) throw new Error(`Login failed for ${email}: ${result.status}`);
  return result.body;
}

async function ensureMember(admin, email, name) {
  const directory = await call(admin, 'GET', '/users');
  let user = directory.body.find((row) => row.email === email);
  let password;
  if (user) {
    await call(admin, 'PATCH', `/users/${user.id}`, { isActive: true });
    const reset = await call(admin, 'POST', `/users/${user.id}/reset-password`);
    password = reset.body.tempPassword;
  } else {
    const created = await call(admin, 'POST', '/users', { name, email, role: 'MEMBER' });
    user = created.body;
    password = created.body.tempPassword;
  }
  return login(email, password);
}

async function main() {
  const adminLogin = await login(ADMIN.email, ADMIN.password);
  const admin = adminLogin.accessToken;
  const managerLogin = await ensureMember(admin, 'permission-manager@example.com', 'Permission Manager');
  const outsiderLogin = await ensureMember(admin, 'permission-outsider@example.com', 'Permission Outsider');
  const manager = managerLogin.accessToken;
  const outsider = outsiderLogin.accessToken;

  const workspace = (await call(admin, 'POST', '/workspaces', { name: `Permission Matrix ${Date.now()}` })).body;
  try {
    await call(admin, 'POST', `/workspaces/${workspace.id}/members`, { add: [adminLogin.user.id, managerLogin.user.id] });
    await call(admin, 'PATCH', `/workspaces/${workspace.id}/members/${managerLogin.user.id}/role`, { role: 'MANAGER' });

    const adminOnly = ['/admin/dashboard', '/users', '/attendance/team', '/leaves', '/attendance/corrections', '/admin/organisation-policy', '/admin/payroll/statements', '/calendar/history'];
    for (const path of adminOnly) {
      const response = await call(manager, 'GET', path);
      ok(response.status === 403, `global member/manager denied admin resource ${path}`, String(response.status));
    }
    ok((await call(manager, 'POST', '/reminders/dispatch', {})).status === 403, 'workspace manager denied global reminder dispatch');

    const outsiderPaths = [
      `/workspaces/${workspace.id}`,
      `/workspaces/${workspace.id}/tasks`,
      `/workspaces/${workspace.id}/capacity-allocations/weekly?periodStart=2026-09-28&periodEnd=2026-10-02`,
      `/reports/wednesday?workspaceId=${workspace.id}`,
      `/reports/snapshots?workspaceId=${workspace.id}`,
      `/metrics/workspace?workspaceId=${workspace.id}&from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z`,
    ];
    for (const path of outsiderPaths) {
      const response = await call(outsider, 'GET', path);
      ok(response.status === 403, `outsider denied direct resource ${path.split('?')[0]}`, String(response.status));
    }

    const draft = await call(manager, 'POST', '/reports/drafts', { workspaceId: workspace.id, reportType: 'WEDNESDAY_PROGRESS' });
    ok(draft.status === 201 && draft.body.status === 'DRAFT', 'workspace manager creates immutable report draft', JSON.stringify(draft.body));
    const premature = await call(manager, 'POST', `/reports/${draft.body.id}/distribute`, {});
    ok(premature.status === 400, 'unapproved report cannot be distributed', String(premature.status));
    const invalidRecipient = await call(manager, 'POST', `/reports/${draft.body.id}/approve`, { recipientIds: [outsiderLogin.user.id] });
    ok(invalidRecipient.status === 400, 'non-workspace recipient cannot be approved', String(invalidRecipient.status));
    const approved = await call(manager, 'POST', `/reports/${draft.body.id}/approve`, {});
    ok(approved.status === 201 && approved.body.status === 'APPROVED', 'manager approves report for workspace members');
    const distributed = await call(manager, 'POST', `/reports/${draft.body.id}/distribute`, {});
    ok(distributed.status === 201 && distributed.body.status === 'DISTRIBUTED' && distributed.body.delivered === 2, 'approved report distributed to validated members', JSON.stringify(distributed.body));
    const notifications = await call(manager, 'GET', '/notifications');
    ok(notifications.body?.items?.some((item) => item.type === 'REPORT_SHARED' && item.data?.reportId === draft.body.id), 'recipient receives report notification');
    ok((await call(outsider, 'POST', `/reports/${draft.body.id}/approve`, {})).status === 403, 'outsider cannot approve report by direct URL');
  } finally {
    await call(admin, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: false });
  }

  if (failures) throw new Error(`${failures} permission matrix assertion(s) failed`);
  console.log('Permissions matrix and report distribution smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
