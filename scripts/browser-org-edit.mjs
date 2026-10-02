// Real-browser test of the simple ways to edit the org chart as an admin: pick-a-person-and-place, "+ Place under",
// click a person to change their manager or title, set the top person, take someone off, and the guided empty-chart start.
// Not part of `pnpm test:all`: needs a browser, the API on :3000 and the Vite dev server on :5173, plus the org-hierarchy fixtures
// (run `pnpm test:orghier` once first).   npm i --no-save playwright-core   &&   node scripts/browser-org-edit.mjs
import { chromium } from 'playwright-core';
const API = 'http://localhost:3000/api';
const WEB = 'http://localhost:5173';
const j = async (t, m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return r.json().catch(() => null); };
const login = await j(null, 'POST', '/auth/login', { email: 'admin@example.com', password: 'admin12345' });
const at = login.accessToken, boss = login.user.id;
const users = await j(at, 'GET', '/users');
const f = (k) => users.find((u) => u.email === `org-hier-${k}@example.com`);
const [mgr, e1, e2, out] = ['mgr', 'e1', 'e2', 'out'].map(f);
const person = async (id) => (await j(at, 'GET', '/org-tree')).people.find((x) => x.id === id);
const mv = (id, to) => j(at, 'PATCH', `/org-tree/people/${id}`, { reportsToId: to });
const off = (id) => j(at, 'DELETE', `/org-tree/people/${id}`);
const hire = users.find((x) => x.email === 'org-hier-new@example.com');
if (hire) await off(hire.id);
// known starting point: CEO (admin) > mgr > e1, e2; out is off the chart
await mv(boss, null); await mv(mgr.id, boss); await mv(e1.id, mgr.id); await mv(e2.id, mgr.id);
if ((await person(out.id)).reportsToId || (await person(out.id)).isTop) await j(at, 'DELETE', `/org-tree/people/${out.id}`);

const results = [];
const ok = (n, v, x = '') => results.push(`${v ? 'PASS' : 'FAIL'} ${n} ${x}`);
process.on('uncaughtException', (e) => { console.log(results.join(String.fromCharCode(10))); console.error('CRASH', String(e.message).split(String.fromCharCode(10))[0]); process.exit(1); });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const login2 = async (p, email, password) => { await p.goto(WEB + '/login'); await p.getByPlaceholder('you@company.com').fill(email); await p.getByPlaceholder('••••••••').fill(password); await p.getByRole('button', { name: /sign in|log in|login/i }).click(); await p.waitForURL((u) => !u.pathname.includes('/login')); };
const pick = async (p, label, text) => { const c = p.getByRole('combobox', { name: label }); await c.click(); await c.fill(text); await p.getByRole('option').filter({ hasText: text }).first().click(); };

// ---------- admin, desktop ----------
{
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await login2(p, 'admin@example.com', 'admin12345');
  await p.goto(WEB + '/org-tree');
  await p.locator(`[data-node="${mgr.id}"]`).waitFor({ timeout: 15000 });
  ok('admin: the place bar is there as soon as the page opens', await p.locator('[data-place-bar]').isVisible());

  // (a) pick a person, pick the manager, press Place -- no dragging
  await pick(p, 'Person to place', 'Hier Outsider');
  const goBefore = await p.locator('[data-place-go]').isDisabled();
  await pick(p, 'Reports to', 'Hier Manager');
  ok('admin: Place stays disabled until both are chosen, then enables', goBefore && !(await p.locator('[data-place-go]').isDisabled()));
  await p.locator('[data-place-go]').click();
  await p.waitForTimeout(900);
  ok('admin: Place puts the person under the chosen manager (no drag)', (await person(out.id)).reportsToId === mgr.id);
  ok('admin: they appear in the chart', (await p.locator(`[data-node="${out.id}"]`).count()) === 1);

  // (b) the "+ Place under" button on a box pre-fills the manager
  await p.locator(`[data-place-under="${e1.id}"]`).click();
  const mgrBox = await p.getByRole('combobox', { name: 'Reports to' }).inputValue();
  ok('admin: "+ Place under" on a box pre-fills who they report to', /Hier Staff One/.test(mgrBox), mgrBox);
  await pick(p, 'Person to place', 'Hier Outsider');
  await p.locator('[data-place-go]').click();
  await p.waitForTimeout(900);
  ok('admin: that moves the person under the box you pressed', (await person(out.id)).reportsToId === e1.id);

  // (c) top of the chart through the same form
  await pick(p, 'Person to place', 'Hier Outsider');
  const under = p.getByRole('combobox', { name: 'Reports to' });
  await under.click();
  await p.getByRole('option').filter({ hasText: 'Top of the chart' }).first().click();
  await p.locator('[data-place-go]').click();
  await p.waitForTimeout(900);
  const top = await person(out.id);
  ok('admin: the same form can put someone at the top', top.isTop === true && top.reportsToId === null);
  ok('admin: a lone top person is drawn (not hidden)', (await p.locator(`[data-node="${out.id}"]`).count()) === 1);


  // (e) the normal way: click a person, change their manager and title in the panel
  await p.locator(`[data-node="${e2.id}"]`).click();
  { const c = p.getByRole('combobox', { name: 'Change manager' }); await c.click(); await c.fill('Hier Staff One'); await p.getByRole('option').filter({ hasText: 'Hier Staff One' }).first().click(); }
  await p.waitForTimeout(900);
  ok('admin: clicking a person and choosing a new manager moves them', (await person(e2.id)).reportsToId === e1.id);
  await p.getByLabel('Title', { exact: true }).fill('Lead Designer');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(900);
  ok('admin: the title field saves', (await person(e2.id)).designation === 'Lead Designer');
  await mv(e2.id, mgr.id);
  await j(at, 'PATCH', `/org-tree/people/${e2.id}`, { designation: null });

  // (d) take off the chart, with a confirm step
  await p.locator(`[data-node="${out.id}"]`).click();
  await p.getByRole('button', { name: /Take off the chart/ }).click();
  ok('admin: taking someone off asks first', await p.getByRole('button', { name: 'Yes, take off' }).isVisible());
  await p.getByRole('button', { name: 'Yes, take off' }).click();
  await p.waitForTimeout(900);
  const off = await person(out.id);
  ok('admin: they are off the chart afterwards', off.reportsToId === null && off.isTop === false && (await p.locator(`[data-node="${out.id}"]`).count()) === 0);
  await p.context().close();
}

// ---------- admin sees the guided start when the chart is empty (stubbed, nothing is changed) ----------
{
  const p = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await login2(p, 'admin@example.com', 'admin12345');
  await p.route('**/api/org-tree', async (r) => {
    if (r.request().method() !== 'GET') return r.continue();
    const res = await r.fetch(); const jn = await res.json();
    await r.fulfill({ response: res, json: { ...jn, people: jn.people.map((x) => ({ ...x, reportsToId: null, isTop: false })) } });
  });
  let sent = null;
  await p.route('**/api/org-tree/people/*', async (r) => { sent = { method: r.request().method(), body: r.request().postData() }; await r.fulfill({ status: 200, json: {} }); });
  await p.goto(WEB + '/org-tree');
  await p.locator('[data-start-card]').waitFor({ timeout: 15000 });
  ok('admin: an empty chart opens on a guided "pick the CEO" card', /person at the top/i.test(await p.locator('[data-start-card]').innerText()));
  ok('admin: guided card fits a phone', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await pick(p, 'Person at the top', 'Hier Manager');
  await p.getByRole('button', { name: 'Set as CEO' }).click();
  await p.waitForTimeout(500);
  ok('admin: "Set as CEO" asks the server to put them at the top', sent?.method === 'PATCH' && JSON.parse(sent.body).reportsToId === null, JSON.stringify(sent));
  await p.screenshot({ path: process.env.TEMP + '/simple-start-phone.png' });
  await p.context().close();
}

// ---------- screenshot of the editing bar on desktop ----------
{
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await login2(p, 'admin@example.com', 'admin12345');
  await p.goto(WEB + '/org-tree');
  await p.locator('[data-place-bar]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: process.env.TEMP + '/simple-edit-desktop.png' });
  await p.context().close();
}
await b.close();
for (const id of [...(hire ? [hire.id] : []), e1.id, e2.id, out.id, mgr.id, boss]) await off(id);
console.log(results.join(String.fromCharCode(10)));
