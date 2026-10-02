// Real-browser test of the org chart as admin, manager and plain viewer, using real drag and drop (Chrome via playwright-core).
// Not part of `pnpm test:all`: needs a browser, the API on :3000, the Vite dev server on :5173 and the org-hierarchy fixtures
// (run `pnpm test:orghier` once first). It re-arranges those fixtures, then resets them.
//   npm i --no-save playwright-core
//   node scripts/browser-org-chart.mjs
import { chromium } from 'playwright-core';
const API = 'http://localhost:3000/api';
const WEB = 'http://localhost:5173';
const j = async (t, m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return r.json().catch(() => null); };
const login = await j(null, 'POST', '/auth/login', { email: 'admin@example.com', password: 'admin12345' });
const at = login.accessToken, boss = login.user.id;
const users = await j(at, 'GET', '/users');
const byEmail = (k) => users.find((u) => u.email === k);
const cred = async (email) => {
  const temp = (await j(at, 'POST', `/users/${byEmail(email).id}/reset-password`)).tempPassword;
  const t = (await j(null, 'POST', '/auth/login', { email, password: temp })).accessToken;
  const NEW = 'OrgTest#12345';
  await j(t, 'POST', '/auth/change-password', { currentPassword: temp, newPassword: NEW });
  return { email, password: NEW };
};
const mgr = byEmail('org-hier-mgr@example.com'), e1 = byEmail('org-hier-e1@example.com'), e2 = byEmail('org-hier-e2@example.com'), out = byEmail('org-hier-out@example.com');
const mv = (id, to) => j(at, 'PATCH', `/org-tree/people/${id}`, { reportsToId: to });
const off = (id) => j(at, 'DELETE', `/org-tree/people/${id}`);
const hire = users.find((x) => x.email === 'org-hier-new@example.com');
if (hire) await off(hire.id);
await mv(boss, null); await mv(mgr.id, boss); await mv(e1.id, mgr.id); await mv(e2.id, mgr.id); await off(out.id);
const parentOf = async (id) => (await j(at, 'GET', '/org-tree')).people.find((p) => p.id === id)?.reportsToId;

const results = [];
const ok = (n, v, x = '') => results.push(`${v ? 'PASS' : 'FAIL'} ${n} ${x}`);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

async function open(email, password, size = { width: 1280, height: 900 }) {
  const ctx = await b.newContext({ viewport: size });
  const p = await ctx.newPage();
  await p.goto(WEB + '/login');
  await p.getByPlaceholder('you@company.com').fill(email);
  await p.getByPlaceholder('••••••••').fill(password);
  await p.getByRole('button', { name: /sign in|log in|login/i }).click();
  await p.waitForTimeout(1500);
  // a forced password change may appear for temp-password users; skip through the API-set flow by going straight to the page
  await p.goto(WEB + '/org-tree');
  return p;
}
const node = (p, id) => p.locator(`[data-node="${id}"]`);

process.on('uncaughtException', (e) => { console.log(results.join(String.fromCharCode(10))); console.error('CRASH', String(e.message).split(String.fromCharCode(10))[0]); process.exit(1); });
// ---------------- ADMIN ----------------
{
  // Tall window: a drag from the "Not in the chart yet" list needs the list and the target box on screen together.
  const p = await open('admin@example.com', 'admin12345', { width: 1280, height: 2400 });
  await node(p, e1.id).waitFor({ timeout: 15000 });
  ok('admin: People chart is the default view', await p.getByRole('button', { name: 'people', exact: true }).getAttribute('aria-pressed') === 'true');
  ok('admin: CEO > manager > staff are all drawn', (await node(p, boss).count()) === 1 && (await node(p, mgr.id).count()) === 1 && (await node(p, e1.id).count()) === 1);
  ok('admin: my node pulses deep green and says You', await node(p, boss).evaluate((e) => getComputedStyle(e).animationName === 'orgPulse' && e.textContent.includes('You')));
  ok('admin: editing is already on when the page opens (no mode to find)', (await p.locator('[data-draggable="true"]').count()) > 0);
  ok('admin: every person is draggable in edit mode', (await node(p, e1.id).getAttribute('data-draggable')) === 'true' && (await node(p, mgr.id).getAttribute('data-draggable')) === 'true');
  await p.waitForTimeout(900);
  await node(p, e1.id).scrollIntoViewIfNeeded();
  await node(p, e1.id).dragTo(node(p, e2.id));
  await p.getByRole('status').first().waitFor({ timeout: 5000 });
  ok('admin: dragging staff onto a colleague moves them', (await parentOf(e1.id)) === e2.id, await p.getByRole('status').first().innerText());
  // invalid: manager onto their own (now deeper) report
  await mgr.id && (await node(p, mgr.id).dragTo(node(p, e1.id), { force: true }).catch(() => {}));
  await p.waitForTimeout(400);
  ok('admin: a loop (manager under own report) is not allowed', (await parentOf(mgr.id)) === boss);
  // place someone not in the chart yet
  await node(p, mgr.id).scrollIntoViewIfNeeded();
  const showAll = p.getByRole('button', { name: /^Show all/ }); if (await showAll.count()) await showAll.click();
  await p.locator(`[data-unplaced] [data-person="${out.id}"]`).scrollIntoViewIfNeeded();
  await p.locator(`[data-unplaced] [data-person="${out.id}"]`).dragTo(node(p, mgr.id));
  await p.waitForTimeout(800);
  ok('admin: an unplaced person is dragged into the chart', (await parentOf(out.id)) === mgr.id);
  // detail panel select
  await node(p, e1.id).click();
  { const c = p.getByRole('combobox', { name: 'Change manager' }); await c.click(); await c.fill('Hier Manager'); await p.getByRole('option').filter({ hasText: 'Hier Manager' }).first().click(); }
  await p.waitForTimeout(800);
  ok('admin: "Reports to" select moves a person without dragging (phone/keyboard route)', (await parentOf(e1.id)) === mgr.id);
  // add person form (fixture email already exists -> error is shown, not swallowed)
  await node(p, mgr.id).click();
  await p.getByRole('button', { name: /Add a person/ }).click();
  await p.getByLabel('Full name').fill('Hier New Hire');
  await p.getByLabel('Email', { exact: true }).fill('org-hier-new@example.com');
  await p.getByRole('button', { name: 'Add person', exact: true }).click();
  await p.waitForTimeout(900);
  const txt = await p.getByRole('status').first().innerText().catch(() => '');
  ok('admin: add-person shows the server answer', /added|exists/i.test(txt), txt);
  await p.screenshot({ path: process.env.TEMP + '/people-admin.png' });
  await p.context().close();
}

// ---------------- MANAGER ----------------
await mv(e1.id, mgr.id); await mv(e2.id, mgr.id); await off(out.id);
{
  const c = await cred('org-hier-mgr@example.com');
  const p = await open(c.email, c.password);
  const landed = await node(p, e1.id).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  ok('manager: can open the org tree', landed, p.url());
  if (landed) {
    ok('manager: editing is already on', (await p.getByRole('button', { name: 'Hide editing' }).count()) === 1);
    ok('manager: own staff are draggable', (await node(p, e1.id).getAttribute('data-draggable')) === 'true');
    ok('manager: the CEO and themselves are NOT draggable', (await node(p, boss).getAttribute('data-draggable')) === null && (await node(p, mgr.id).getAttribute('data-draggable')) === null);
    ok('manager: cannot add people', (await p.getByRole('button', { name: /Add a person/ }).count()) === 0);
    await p.waitForTimeout(900);
    await node(p, e1.id).dragTo(node(p, e2.id));
    await p.waitForTimeout(800);
    ok('manager: can reorganise inside their team', (await parentOf(e1.id)) === e2.id);
    { const sa = p.getByRole('button', { name: /^Show all/ }); if (await sa.count()) await sa.click(); }
    ok('manager: unplaced people cannot be dragged', (await p.locator(`[data-unplaced] [data-person="${out.id}"]`).getAttribute('draggable')) !== 'true');
    await node(p, e1.id).click();
    await p.getByRole('combobox', { name: 'Change manager' }).click();
    const opts = await p.getByRole('option').allInnerTexts();
    ok('manager: "Reports to" lists only their own team (no CEO, no outsiders)', opts.length >= 1 && !opts.some((o) => o.includes('Org Tree Smoke') || o.includes('Hier Outsider') || o.includes('Admin')), opts.join(' | '));
    await p.context().close();
  }
}

// ---------------- VIEWER ----------------
{
  const c = await cred('org-hier-out@example.com');
  const p = await open(c.email, c.password, { width: 390, height: 800 });
  const landed = await p.locator('[data-node]').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  ok('viewer: can see the chart on a phone', landed);
  ok('viewer: no edit button', (await p.getByRole('button', { name: /Edit (chart|my team)/ }).count()) === 0);
  ok('viewer: nothing is draggable', (await p.locator('[data-draggable="true"]').count()) === 0);
  ok('viewer: no horizontal page scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.screenshot({ path: process.env.TEMP + '/people-viewer-phone.png' });
  await p.context().close();
}

await b.close();
for (const id of [...(hire ? [hire.id] : []), e1.id, e2.id, out.id, mgr.id, boss]) await off(id);
console.log(results.join('\n'));
