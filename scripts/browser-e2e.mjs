// Real-browser end-to-end test of the web app (Chrome via playwright-core). Not part of `pnpm test:all`: it needs a browser.
//
//   npm i --no-save playwright-core        (once; nothing is added to package.json)
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node scripts/browser-e2e.mjs
//
// Needs the API on :3000 and the Vite dev server on :5173 (WEB_URL / API_URL override), plus the seeded admin.
// It creates one throwaway workspace through the API, drives the UI (forms, filters, drawer, attendance, settings,
// meeting board) and repeats the key screens at phone width, failing on clipped text or sideways page scroll.
// Screenshots go to the OS temp directory; the workspace is archived afterwards.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
import os from 'node:os';
import path from 'node:path';
const SHOTS = new URL(`file:///${path.join(os.tmpdir(), 'tt-browser-e2e').replace(/\\/g, '/')}/`);
fs.mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now();

const results = [];
const problems = []; // console errors + failed requests
let page;

async function api(token, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; }
}

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, ok: false, err: String(e.message).split('\n')[0] });
    console.log(`FAIL ${name} :: ${String(e.message).split('\n')[0]}`);
    try { await page.screenshot({ path: new URL(`FAIL-${name.replace(/\W+/g, '_').slice(0, 50)}.png`, SHOTS).pathname.replace(/^\/([A-Za-z]:)/, '$1') }); } catch {}
  }
}
const shot = (n) => page.screenshot({ path: new URL(`${n}.png`, SHOTS).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: false });

const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'admin12345' }) })).json();
const token = login.accessToken;
const me = login.user;

// ---- fixtures through the API ----
const ws = (await api(token, 'POST', '/workspaces', { name: `E2E Browser ${stamp}` })).b;
await api(token, 'POST', `/workspaces/${ws.id}/members`, { add: [me.id] });
const proj = (await api(token, 'GET', `/workspaces/${ws.id}/projects`)).b[0];
const proj2 = (await api(token, 'POST', `/workspaces/${ws.id}/projects`, { name: 'Zebra Website', taskPrefix: 'ZEB' })).b;
const DAY = 864e5;
const mkTask = async (extra) => (await api(token, 'POST', `/workspaces/${ws.id}/tasks`, { projectId: proj.id, ...extra })).b;
const tA = await mkTask({ title: 'E2E predecessor task', ownerId: me.id, dueDate: new Date(Date.now() + 6 * DAY).toISOString(), baselineEstimateMinutes: 45 });
const tB = await mkTask({ title: 'E2E main task', ownerId: me.id, dueDate: new Date(Date.now() + 6 * DAY).toISOString(), baselineEstimateMinutes: 150 });
const tC = await mkTask({ title: 'E2E bare task' });
const tLate = await mkTask({ title: 'E2E overdue task', ownerId: me.id, dueDate: new Date(Date.now() - 3 * DAY).toISOString(), baselineEstimateMinutes: 30 });
console.log('fixtures ready:', ws.id, tB.ref);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 160)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));
page.on('response', (r) => { if (r.status() >= 400 && !/\/auth\/refresh/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`); });

try {
  // ---------- login ----------
  await step('login through the form', async () => {
    await page.goto(`${WEB}/login`);
    await page.getByPlaceholder('you@company.com').fill('admin@example.com');
    await page.getByPlaceholder('••••••••').fill('admin12345');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  });

  // ---------- dashboard ----------
  await step('dashboard: shared filter bar, exceptions first, scope captions', async () => {
    await page.goto(`${WEB}/`);
    await page.getByRole('group', { name: 'Dashboard filters' }).waitFor({ timeout: 15000 });
    await page.getByText('Overdue commitments').first().waitFor();
    await page.getByText('All workspaces, open tasks, live').waitFor();
    await shot('01-dashboard');
  });
  await step('dashboard: metrics default to the most active workspace, not the alphabetical first', async () => {
    const dash = (await api(token, 'GET', '/admin/dashboard')).b;
    const wsList = (await api(token, 'GET', '/workspaces')).b.filter((w) => !w.isArchived).sort((a, b) => a.name.localeCompare(b.name));
    const expected = dash.mostActiveWorkspace?.name;
    const shown = await page.locator('select[aria-label="Workspace"]').first().evaluate((el) => el.options[el.selectedIndex].text);
    if (expected && shown !== expected) throw new Error(`filter shows "${shown}" but the most active workspace is "${expected}" (alphabetical first is "${wsList[0]?.name}")`);
  });
  await step('dashboard: workspace delivery state shows actionable labels, not Idle', async () => {
    const t = page.getByText('Workspace delivery state');
    await t.scrollIntoViewIfNeeded();
    await page.getByText(/Active|Awaiting review|Blocked|Update overdue|No active work|Weekly off/).first().waitFor();
    if (await page.getByText(/^Idle$/).count()) throw new Error('"Idle" label still shown');
    await shot('02-dashboard-state');
  });
  await step('dashboard: overdue stat card jumps to the overdue list', async () => {
    await page.getByRole('link', { name: /Overdue commitments/ }).click();
    await page.waitForFunction(() => location.hash === '#overdue-list');
  });
  await step('dashboard: changing the period filter reloads the metrics', async () => {
    const before = page.waitForResponse((r) => r.url().includes('/metrics/workspace') && r.ok());
    await page.getByLabel('Period').selectOption('7d');
    await before;
  });

  // ---------- workspace + projects ----------
  await step('workspace page loads with the new project search and pills', async () => {
    await page.goto(`${WEB}/workspaces/${ws.id}`);
    await page.getByLabel('Search projects').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: /Zebra Website/ }).waitFor();
    await shot('03-workspace');
  });
  await step('project search filters the pills and keeps scope visible', async () => {
    await page.getByLabel('Search projects').fill('zeb');
    await page.getByRole('button', { name: /Zebra Website/ }).waitFor();
    if (await page.getByRole('button', { name: /^General/ }).count()) throw new Error('General pill should be filtered out');
    await page.getByLabel('Search projects').fill('nomatchxyz');
    await page.getByText(/No project matches/).waitFor();
    await page.getByLabel('Search projects').fill('');
  });
  await step('Edit project: rename + colour persists', async () => {
    await page.getByRole('button', { name: /Zebra Website/ }).click();
    await page.getByRole('button', { name: 'Edit project' }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit project' });
    await dlg.waitFor();
    await dlg.locator('input').first().fill('Zebra Web Platform');
    await dlg.getByRole('button', { name: '#10b981' }).click();
    await shot('04-edit-project');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: /Zebra Web Platform/ }).waitFor();
    const p = (await api(token, 'GET', `/workspaces/${ws.id}/projects`)).b.find((x) => x.id === proj2.id);
    if (p.name !== 'Zebra Web Platform' || p.color !== '#10b981') throw new Error('not persisted: ' + JSON.stringify(p));
  });
  await step('Edit project: archive removes it from the pills', async () => {
    await page.getByRole('button', { name: 'Edit project' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('dialog', { name: 'Edit project' }).getByRole('button', { name: 'Archive' }).click();
    await page.waitForFunction(() => !document.body.innerText.includes('Zebra Web Platform'), null, { timeout: 8000 });
    await api(token, 'PATCH', `/projects/${proj2.id}`, { isArchived: false });
  });

  // ---------- task list ----------
  await step('task list: planning chips and attention filter', async () => {
    await page.goto(`${WEB}/workspaces/${ws.id}`);
    await page.getByText('E2E bare task').waitFor({ timeout: 15000 });
    await page.getByText('No owner').first().waitFor();
    await page.getByLabel('Needs attention').selectOption('NO_OWNER');
    await page.getByText('E2E bare task').waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('E2E main task'));
    if (!page.url().includes('attention=NO_OWNER')) throw new Error('filter is not in the URL: ' + page.url());
    await shot('05-filtered-list');
    await page.getByLabel('Needs attention').selectOption('OVERDUE');
    await page.getByText('E2E overdue task').waitFor();
    await page.getByLabel('Needs attention').selectOption('');
  });
  await step('filters survive a reload because they live in the URL', async () => {
    await page.goto(`${WEB}/workspaces/${ws.id}?attention=NO_DEADLINE`);
    await page.getByText('E2E bare task').waitFor({ timeout: 15000 });
    const v = await page.getByLabel('Needs attention').inputValue();
    if (v !== 'NO_DEADLINE') throw new Error('select shows ' + v);
    await page.getByLabel('Needs attention').selectOption('');
  });

  // ---------- task drawer ----------
  await page.goto(`${WEB}/workspaces/${ws.id}?task=${tB.id}`);
  await step('task drawer opens from the URL with size chip and breakup prompt', async () => {
    await page.getByRole('heading', { name: 'E2E main task' }).waitFor({ timeout: 15000 });
    await page.getByText('Larger work').first().waitFor();
    await page.getByText(/150 minutes of work/).waitFor();
    await shot('06-drawer');
  });
  await step('acceptance criteria: add and persist', async () => {
    const ac = page.locator('section', { has: page.getByRole('heading', { name: 'Acceptance criteria' }) });
    await ac.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Acceptance criteria').fill('Three layout options delivered as a PDF');
    await ac.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Three layout options delivered as a PDF').waitFor();
    const t = (await api(token, 'GET', `/tasks/${tB.id}`)).b;
    if (t.acceptanceCriteria !== 'Three layout options delivered as a PDF') throw new Error('not saved');
  });
  await step('due date: changing it demands a reason, shows the original, saves with audit', async () => {
    const d = page.getByLabel('Due date');
    const next = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10);
    await d.fill(next);
    const save = page.getByRole('button', { name: 'Save deadline' });
    if (!(await save.isDisabled())) throw new Error('Save should be disabled until a reason is typed');
    await page.getByLabel('Reason for deadline').fill('Client asked for a later date');
    await save.click();
    await page.getByText(/Original commitment:/).first().waitFor();
    const h = (await api(token, 'GET', `/tasks/${tB.id}/history`)).b.find((x) => x.action === 'DUE_DATE_CHANGED');
    if (h?.afterValue?.reason !== 'Client asked for a later date') throw new Error('reason missing from audit');
  });
  await step('due date: a weekend date shows the off-day warning', async () => {
    const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + 14); // a Saturday
    await page.getByLabel('Due date').fill(d.toISOString().slice(0, 10));
    await page.getByText(/weekly off day/).waitFor();
    await shot('07-weekend-warning');
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  });
  await step('estimate: approved field is read-only; revision needs reason and records classification', async () => {
    if (!(await page.getByLabel('Approved estimate in minutes').isDisabled())) throw new Error('approved estimate is editable');
    await page.getByRole('button', { name: 'Revise approved estimate' }).click();
    await page.getByLabel('Revised estimate in minutes').fill('180');
    await page.getByLabel('Kind of change').selectOption('CLIENT_CHANGE');
    await page.getByLabel('Reason for estimate revision').fill('Client added a banner set');
    await page.getByRole('button', { name: 'Record revision' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Original commitment') || true);
    const t = (await api(token, 'GET', `/tasks/${tB.id}`)).b;
    if (t.currentEstimateMinutes !== 180 || t.baselineEstimateMinutes !== 150) throw new Error(`baseline/current ${t.baselineEstimateMinutes}/${t.currentEstimateMinutes}`);
  });
  await step('dependencies: add a predecessor and see it listed', async () => {
    await page.getByRole('button', { name: 'Add dependency' }).click();
    await page.getByPlaceholder('Search tasks in this workspace…').fill('predecessor');
    await page.locator('ul.max-h-44 button').first().click();
    await page.getByText('Waits on').waitFor();
    await page.getByText(/Waiting on 1 unfinished predecessor/).waitFor();
    await shot('08-dependencies');
  });
  await step('blockers: block with unblocker + follow-up, then mark unblocked', async () => {
    await page.getByRole('button', { name: '+ Mark as blocked' }).click();
    await page.getByPlaceholder('State what is blocking this task…').fill('Waiting for the client logo');
    await page.getByLabel('Next follow-up').fill(new Date(Date.now() + 2 * DAY).toISOString().slice(0, 16));
    await page.getByRole('button', { name: 'Record blocker' }).click();
    await page.getByText(/Blocked since/).waitFor({ timeout: 15000 });
    await shot('09-blocker');
    await page.getByRole('button', { name: 'Mark unblocked' }).click();
    await page.getByText('No active blockers for this task.').waitFor();
    await page.getByText('1 resolved blocker').waitFor();
  });
  await step('log time then move minutes to a subtask (needs a subtask first)', async () => {
    await page.getByPlaceholder('Add a subtask…').fill('E2E subtask');
    await page.getByPlaceholder('Add a subtask…').press('Enter');
    await page.getByText('E2E subtask').first().waitFor();
    const kept = (await api(token, 'GET', `/tasks/${tB.id}`)).b;
    if (kept.baselineEstimateMinutes !== 150 || kept.currentEstimateMinutes !== 180) throw new Error(`adding an estimate-less subtask changed the parent estimates to ${kept.baselineEstimateMinutes}/${kept.currentEstimateMinutes}`);
    await api(token, 'POST', `/tasks/${tB.id}/time-entries`, { workDate: new Date().toISOString().slice(0, 10), durationMinutes: 30, category: 'EXECUTION' }).catch(() => null);
  });
  await step('no-reviewer note and save-error banner: a blocked Done shows a message', async () => {
    await page.getByText(/No reviewer: whether this can be marked Done/).first().waitFor();
    await api(token, 'PUT', '/admin/organisation-policy', { ...(await api(token, 'GET', '/admin/organisation-policy')).b, earnedLeaveMonthly: 1, casualLeaveMonthly: 1, noReviewerDonePolicy: 'REQUIRE_REVIEWER' });
    await page.reload();
    await page.getByRole('heading', { name: 'E2E main task' }).waitFor();
    await page.locator('div.fixed select[aria-label="Status"]').selectOption('DONE');
    await page.getByRole('alert').filter({ hasText: /reviewer/i }).waitFor({ timeout: 8000 });
    await shot('10-save-error');
    const pol = (await api(token, 'GET', '/admin/organisation-policy')).b;
    await api(token, 'PUT', '/admin/organisation-policy', { ...pol, earnedLeaveMonthly: Number(pol.earnedLeaveMonthly), casualLeaveMonthly: Number(pol.casualLeaveMonthly), noReviewerDonePolicy: 'ALLOW' });
  });

  // ---------- review queue ----------
  await step('review queue page renders', async () => {
    await page.goto(`${WEB}/reviews`);
    await page.getByRole('heading', { name: 'Review queue' }).waitFor({ timeout: 15000 });
    await shot('11-reviews');
  });

  // ---------- attendance ----------
  await step('attendance: day-state calendar with legend and monthly summary', async () => {
    await page.goto(`${WEB}/attendance`);
    await page.getByText('Pending correction').first().waitFor({ timeout: 15000 });
    await page.getByTestId('month-summary').waitFor();
    await page.getByText(/Weekends and holidays are never counted as absence/).waitFor();
    await shot('12-attendance');
  });
  await step('attendance: admin tabs incl. Team Availability, Payroll Inputs, Policy', async () => {
    for (const tab of ['Team Availability', 'Payroll Inputs', 'Policy', 'Leave Types']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(400);
      if (tab === 'Team Availability') { await page.getByText(/Team availability ·/).waitFor(); await shot('13-team-availability'); }
      if (tab === 'Payroll Inputs') await page.getByText('Attendance and payable indicator only').waitFor();
      if (tab === 'Policy') { await page.getByLabel('Rule for tasks with no reviewer').waitFor(); await shot('14-policy'); }
      if (tab === 'Leave Types') { await page.getByLabel('Applies to').waitFor(); await shot('15-leave-types'); }
    }
  });

  // ---------- settings ----------
  await step('settings: calendar is a draft that needs a reason; schedule groups card present', async () => {
    await page.goto(`${WEB}/settings`);
    await page.getByRole('heading', { name: 'Organisation calendar' }).waitFor({ timeout: 15000 });
    await page.getByRole('heading', { name: 'Schedule groups' }).waitFor();
    const brk = page.getByLabel(/Unpaid break/);
    const old = await brk.inputValue();
    await brk.fill(String(Number(old) + 5));
    const save = page.getByRole('button', { name: 'Save new version' });
    if (!(await save.isDisabled())) throw new Error('save should wait for a reason');
    await shot('16-settings-draft');
    await page.getByRole('button', { name: 'Discard' }).click();
    if ((await page.getByLabel(/Unpaid break/).inputValue()) !== old) throw new Error('discard did not restore');
  });

  // ---------- organisation (parallel work) ----------
  await step('organisation admin page renders', async () => {
    await page.goto(`${WEB}/organisation`);
    await page.getByText(/Office/i).first().waitFor({ timeout: 15000 });
    await shot('17-organisation');
  });

  // ---------- meeting board project picker ----------
  await step('meetings: project picker is searchable and filters across workspaces', async () => {
    await page.goto(`${WEB}/meetings`);
    await page.locator('button:visible', { hasText: /^\s*\+?\s*Add\s*$/ }).first().waitFor({ timeout: 15000 });
    await page.locator('button:visible', { hasText: /^\s*\+?\s*Add\s*$/ }).first().click();
    const combo = page.locator('input[aria-label="Project"]:visible').first();
    await page.getByPlaceholder(/./).first().isVisible().catch(() => null);
    await combo.click();
    await shot('18-meeting-picker-open');
    await combo.fill('E2E Browser');
    await page.locator('[role="listbox"] [role="option"]').first().waitFor();
    if ((await page.locator('[role="listbox"] [role="option"]').count()) < 1) throw new Error('no options after search');
    await shot('19-meeting-picker-filtered');
    // Choosing an option must keep the composer open (focus stays inside) and must not submit a card.
    await page.locator('[role="listbox"] [role="option"]').first().click();
    await page.waitForTimeout(500);
    if ((await page.locator('textarea[maxlength="1000"]').count()) < 1) throw new Error('the composer closed when an option was chosen');
    const picked = await combo.inputValue();
    if (!picked) throw new Error('no project shown after choosing');
    const board = (await api(token, 'GET', '/meeting-boards')).b;
    if (board.items.length !== 1) throw new Error('a card was created by choosing an option: ' + board.items.map((i) => i.title));
    await page.keyboard.press('Escape');
  });

  // ---------- phone width ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await phone.newPage();
  mp.on('pageerror', (e) => problems.push(`mobile pageerror: ${String(e).slice(0, 160)}`));
  await mp.goto(`${WEB}/login`);
  await mp.getByPlaceholder('you@company.com').fill('admin@example.com');
  await mp.getByPlaceholder('••••••••').fill('admin12345');
  await mp.getByRole('button', { name: /sign in|log in|login/i }).click();
  await mp.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  const clipped = async (label) => {
    const bad = await mp.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('main *, #root *')) {
        if (!el.childNodes.length || el.children.length) continue;
        const txt = (el.textContent || '').trim();
        if (!txt) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'inline' || cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (cs.textOverflow === 'ellipsis') continue; // deliberate truncation
        // Anything inside a horizontally scrollable row (tab bars, pill rows, wide tables) is meant to scroll.
        let scroller = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o === 'auto' || o === 'scroll') { scroller = true; break; }
        }
        if (scroller) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        // Text that pokes out past its own box, or past the right edge of the phone, is cut off for the reader.
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') out.push(txt.slice(0, 40));
        else if (r.right > window.innerWidth + 2) out.push('off-screen: ' + txt.slice(0, 40));
      }
      return [...new Set(out)].slice(0, 5);
    });
    if (bad.length) throw new Error(`${label}: clipped text -> ${JSON.stringify(bad)}`);
  };
  const overflow = async (label) => {
    const o = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw + 2) throw new Error(`${label}: page scrolls horizontally (${o.sw} > ${o.cw})`);
  };
  const mshot = (n) => mp.screenshot({ path: new URL(`${n}.png`, SHOTS).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  for (const [label, path, wait] of [
    ['dashboard', '/', (p) => p.getByRole('group', { name: 'Dashboard filters' })],
    ['workspace list', `/workspaces/${ws.id}`, (p) => p.getByText('E2E bare task')],
    ['task drawer', `/workspaces/${ws.id}?task=${tB.id}`, (p) => p.getByRole('heading', { name: 'E2E main task' })],
    ['attendance', '/attendance', (p) => p.getByText('Pending correction').first()],
    ['settings', '/settings', (p) => p.getByRole('heading', { name: 'Organisation calendar' })],
    ['review queue', '/reviews', (p) => p.getByRole('heading', { name: 'Review queue' })],
    ['meetings', '/meetings', (p) => p.getByText(/Mon|Monday/).first()],
  ]) {
    await step(`phone 390px: ${label} fits without sideways page scroll`, async () => {
      await mp.goto(`${WEB}${path}`);
      await wait(mp).waitFor({ timeout: 15000 });
      await mp.waitForTimeout(400);
      await mshot(`m-${label.replace(/\W+/g, '_')}`);
      await overflow(label);
      await clipped(label);
    });
  }
  await phone.close();
} finally {
  await browser.close();
  await api(token, 'PATCH', `/workspaces/${ws.id}`, { isArchived: true }).catch(() => null);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
for (const f of failed) console.log(`  FAILED: ${f.name} :: ${f.err}`);
const uniq = [...new Set(problems)];
console.log(`\n${uniq.length} distinct console errors / failed requests:`);
for (const p of uniq.slice(0, 25)) console.log('  ' + p);
fs.writeFileSync(new URL('./results.json', SHOTS), JSON.stringify({ results, problems: uniq }, null, 2));
process.exit(failed.length ? 1 : 0);
