#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers Wednesday progress and Friday outcomes report drafts (X01).

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

  const wsResult = await call(token, 'POST', '/workspaces', { name: `Reports Smoke ${Date.now()}` });
  assert(wsResult.status === 201, 'workspace created', JSON.stringify(wsResult.body));
  const workspace = wsResult.body;
  try {
    const wedRes = await call(token, 'GET', `/reports/wednesday?workspaceId=${workspace.id}`);
    assert(wedRes.status === 200, 'wednesday progress draft report fetched', JSON.stringify(wedRes.body));
    assert(wedRes.body.reportType === 'WEDNESDAY_PROGRESS', 'report type is WEDNESDAY_PROGRESS');

    const friRes = await call(token, 'GET', `/reports/friday?workspaceId=${workspace.id}`);
    assert(friRes.status === 200, 'friday outcomes draft report fetched', JSON.stringify(friRes.body));
    assert(friRes.body.reportType === 'FRIDAY_OUTCOMES', 'report type is FRIDAY_OUTCOMES');
  } finally {
    if (workspace?.id) await call(token, 'PATCH', `/workspaces/${workspace.id}`, { isArchived: false });
  }
  if (failures) throw new Error(`${failures} reports smoke assertion(s) failed`);
  console.log('Reports smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
