// Real-browser test of the Weekly tasks page: the rename and the per-team progress (Chrome via playwright-core).
// Not part of `pnpm test:all`: needs a browser, the API on :3000 and the Vite dev server on :5173.
// Seeds cards into an isolated week 41 weeks back (never the current one), opens it with ?week=, then clears it.
//   npm i --no-save playwright-core
//   node scripts/browser-weekly-tasks.mjs
import { chromium } from 'playwright-core';

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const d = new Date(); d.setDate(d.getDate() - 41 * 7);
const WEEK = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const j = async (t, m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return r.json().catch(() => null); };
const login = await j(null, 'POST', '/auth/login', { email: 'admin@example.com', password: 'admin12345' });
const at = login.accessToken;
const users = await j(at, 'GET', '/users');
const u = (k) => users.find((x) => x.email === `org-hier-${k}@example.com`);
const [e1, e2, mgr, out] = ['e1', 'e2', 'mgr', 'out'].map(u);
if (![e1, e2, mgr, out].every(Boolean)) { console.error('Run `pnpm test:orghier` once first to create the fixtures.'); process.exit(2); }

const teams = await j(at, 'GET', '/organisation/teams');
const mk = async (name) => teams.find((t) => t.name === name) ?? (await j(at, 'POST', '/organisation/teams', { name }));
const tech = await mk('Weekly Smoke Tech'), prod = await mk('Weekly Smoke Production');
await j(at, 'PUT', `/organisation/teams/${tech.id}/members`, { userIds: [e1.id, e2.id] });
await j(at, 'PUT', `/organisation/teams/${prod.id}/members`, { userIds: [mgr.id] });

const board = await j(at, 'GET', `/meeting-boards?date=${WEEK}`);
for (const i of board.items) await j(at, 'DELETE', `/meeting-boards/items/${i.id}`);
const card = (userId, title, status) => j(at, 'POST', `/meeting-boards/${board.id}/items`, { userId, dayDate: board.days[0], slot: 'FIRST', title, status });
await card(e1.id, 'Tech A', 'DONE'); await card(e1.id, 'Tech B', 'PENDING'); await card(e2.id, 'Tech C', 'IN_PROGRESS');
await card(mgr.id, 'Prod A', 'DONE'); await card(out.id, 'Loose', 'PENDING');

const results = [];
const ok = (n, v, x = '') => results.push(`${v ? 'PASS' : 'FAIL'} ${n} ${x}`);
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const [label, size] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: size });
    const p = await ctx.newPage();
    await p.goto(`${WEB}/login`);
    await p.getByPlaceholder('you@company.com').fill('admin@example.com');
    await p.getByPlaceholder('••••••••').fill('admin12345');
    await p.getByRole('button', { name: /sign in|log in|login/i }).click();
    await p.waitForURL((x) => !x.pathname.includes('/login'));
    await p.goto(`${WEB}/meetings?week=${WEEK}`);
    await p.locator('[data-team-strip]').waitFor({ timeout: 15000 });

    if (label === 'desktop') {
      ok('sidebar says Weekly tasks, not Meetings', (await p.getByRole('link', { name: 'Weekly tasks' }).count()) >= 1 && (await p.getByRole('link', { name: 'Meetings', exact: true }).count()) === 0);
    }
    ok(`${label}: page heading carries the Weekly tasks label`, (await p.getByText('Weekly tasks', { exact: true }).count()) >= 1);
    const techRow = p.locator(`[data-team-row="${tech.id}"]`);
    const prodRow = p.locator(`[data-team-row="${prod.id}"]`);
    ok(`${label}: Tech shows 1/3 done and 33%`, /1\/3 done/.test(await techRow.innerText()) && /33%/.test(await techRow.innerText()), (await techRow.innerText()).replace(/\n/g, ' '));
    ok(`${label}: Production shows 1/1 done and 100%`, /1\/1 done/.test(await prodRow.innerText()) && /100%/.test(await prodRow.innerText()));
    ok(`${label}: a no-team row exists for loose cards`, (await p.locator('[data-team-row="none"]').count()) === 1);
    ok(`${label}: no page-level horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

    await p.getByRole('button', { name: 'Team & Progress' }).click();
    const cardEl = p.locator(`[data-team-card="${tech.id}"]`);
    await cardEl.waitFor();
    await cardEl.getByRole('button').first().click();
    ok(`${label}: expanding Tech lists its people`, (await cardEl.getByText('Hier Staff One').count()) === 1 && (await cardEl.getByText('Hier Staff Two').count()) === 1);
    await cardEl.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${process.env.TEMP ?? '.'}/weekly-${label}.png` });
    await ctx.close();
  }
} finally {
  await b.close();
  const after = await j(at, 'GET', `/meeting-boards?date=${WEEK}`);
  for (const i of after.items) await j(at, 'DELETE', `/meeting-boards/items/${i.id}`);
  for (const t of [tech, prod]) await j(at, 'PUT', `/organisation/teams/${t.id}/members`, { userIds: [] });
}
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
