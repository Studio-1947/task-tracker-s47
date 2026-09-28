#!/usr/bin/env node
// Smoke test against a RUNNING, migrated and seeded API.
// Covers attendance corrections, approval workflow, and day states (H01, AT18).

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ADMIN = {
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
  const adminLogin = await login(ADMIN);
  const token = adminLogin.accessToken;

  // Friday missed checkout correction scenario (AT18)
  const fridayStr = '2026-09-25'; // A Friday date
  const propCheckIn = '2026-09-25T09:00:00.000Z';
  const propCheckOut = '2026-09-25T17:00:00.000Z';

  const reqRes = await call(token, 'POST', '/attendance/corrections', {
    workDate: fridayStr,
    proposedCheckInAt: propCheckIn,
    proposedCheckOutAt: propCheckOut,
    reason: 'Missed checkout on Friday due to power outage',
  });
  assert(reqRes.status === 201, 'attendance correction requested', JSON.stringify(reqRes.body));
  const correction = reqRes.body;

  const listRes = await call(token, 'GET', '/attendance/corrections/me');
  assert(listRes.status === 200, 'listed my corrections', JSON.stringify(listRes.body));
  assert(listRes.body.some((c) => c.id === correction.id), 'found requested correction in list');

  const reviewRes = await call(token, 'POST', `/attendance/corrections/${correction.id}/review`, {
    status: 'APPROVED',
    note: 'Approved Friday checkout correction',
  });
  assert(reviewRes.status === 201 || reviewRes.status === 200, 'correction approved by admin', JSON.stringify(reviewRes.body));

  if (failures) throw new Error(`${failures} attendance correction smoke assertion(s) failed`);
  console.log('Attendance correction smoke passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
