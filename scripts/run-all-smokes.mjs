#!/usr/bin/env node
// Runs every running-API smoke suite in sequence and prints one summary table.
//
//   pnpm test:all            all suites except the slow ones
//   pnpm test:all -- --slow  include the suites that wait on real time (update-overdue, ~3 min)
//   pnpm test:all -- ageing org   run only the named suites
//
// Needs a migrated, seeded API at API_URL (default http://localhost:3000/api). Never point it at production:
// suites create users, workspaces and tasks.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const SLOW = new Set(['updates']);
const NEVER = new Set(['stress', 'browser', 'browser-orgchart', 'browser-weekly']); // load test and the real-browser suite: neither is a plain API smoke

const args = process.argv.slice(2).filter((a) => a !== '--');
const includeSlow = args.includes('--slow');
const named = args.filter((a) => !a.startsWith('--'));

const suites = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith('test:') && !['test:all'].includes(k))
  .map((k) => k.slice('test:'.length))
  .filter((n) => !NEVER.has(n) && !n.startsWith('browser'))
  .filter((n) => (named.length ? named.includes(n) : includeSlow || !SLOW.has(n)));

if (suites.length === 0) {
  console.error(`No matching suites. Available: ${Object.keys(pkg.scripts).filter((k) => k.startsWith('test:')).map((k) => k.slice(5)).join(', ')}`);
  process.exit(2);
}

const API = process.env.API_URL ?? 'http://localhost:3000/api';
try {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error(String(res.status));
} catch (e) {
  console.error(`The API is not answering at ${API}/health (${e.message}). Start it first.`);
  process.exit(2);
}

const rows = [];
for (const name of suites) {
  const started = Date.now();
  process.stdout.write(`running ${name} ... `);
  const run = spawnSync(process.execPath, [new URL(`./${scriptFor(name)}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], {
    encoding: 'utf8',
    env: process.env,
    timeout: 10 * 60_000,
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const passes = (out.match(/^(PASS|✓) /gm) ?? []).length;
  const fails = (out.match(/^(FAIL|✗) /gm) ?? []).length;
  const ok = run.status === 0;
  console.log(ok ? `ok (${secs}s)` : `FAILED (${secs}s)`);
  if (!ok) console.log(out.split('\n').filter((l) => /^(FAIL|✗)|Error|failed/i.test(l)).slice(0, 8).map((l) => `    ${l}`).join('\n'));
  rows.push({ name, ok, secs, passes, fails });
}

function scriptFor(name) {
  const cmd = pkg.scripts[`test:${name}`];
  const m = cmd.match(/node\s+(scripts\/[\w.-]+\.mjs)/);
  if (!m) throw new Error(`test:${name} is not a plain node script: ${cmd}`);
  return `../${m[1]}`;
}

console.log('\nsuite'.padEnd(16) + 'result'.padEnd(10) + 'checks'.padEnd(10) + 'time');
for (const r of rows) console.log(r.name.padEnd(15) + (r.ok ? 'pass' : 'FAIL').padEnd(10) + String(r.passes).padEnd(10) + `${r.secs}s`);
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} suites passed${failed.length ? `; failed: ${failed.map((r) => r.name).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
