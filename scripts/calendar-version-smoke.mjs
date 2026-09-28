#!/usr/bin/env node
const API = process.env.API_URL ?? 'http://localhost:3000/api';
let failures = 0;
function ok(value, label, detail = '') { if (value) console.log(`PASS ${label}`); else { failures++; console.error(`FAIL ${label}${detail ? ` - ${detail}` : ''}`); } }
async function call(token, method, path, body) { const r = await fetch(`${API}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await r.text(); let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; } return { status: r.status, body: parsed }; }
async function main() {
  const login = await call(null, 'POST', '/auth/login', { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345' }); const token = login.body.accessToken;
  const current = await call(token, 'GET', '/calendar');
  const updated = await call(token, 'PUT', '/calendar', { ...current.body.settings, changeReason: 'Calendar version smoke verification' });
  ok(updated.status === 200, 'calendar update with reason succeeds', JSON.stringify(updated.body));
  const history = await call(token, 'GET', '/calendar/history');
  ok(history.status === 200 && history.body.some((v) => v.changeReason === 'Calendar version smoke verification'), 'effective-dated calendar version is retained');
  const group = await call(token, 'POST', '/calendar/schedule-groups', { name: `Smoke schedule ${Date.now()}`, timezone: 'Asia/Kolkata', workdays: [1,2,3,4,5], startMinute: 600, endMinute: 1140, unpaidBreakMinutes: 60, effectiveFrom: '2026-10-01' });
  ok(group.status === 201, 'schedule group created', JSON.stringify(group.body));
  const groups = await call(token, 'GET', '/calendar/schedule-groups');
  ok(groups.body.some((g) => g.id === group.body.id), 'schedule group listed');
  const saturday = await call(token, 'GET', '/attendance/state?date=2026-10-03');
  ok(saturday.status === 200 && saturday.body === 'WEEKLY_OFF', 'AT02 Saturday is explicitly Weekly off', JSON.stringify(saturday.body));
  await call(token, 'DELETE', `/calendar/schedule-groups/${group.body.id}`);
  if (failures) throw new Error(`${failures} calendar assertion(s) failed`);
  console.log('Calendar version and schedule-group smoke passed.');
}
main().catch((error) => { console.error(error); process.exit(1); });
