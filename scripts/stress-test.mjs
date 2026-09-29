#!/usr/bin/env node

const API = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
const durationSeconds = Number(process.env.STRESS_DURATION_SECONDS ?? 15);
const levels = (process.env.STRESS_CONCURRENCY ?? '10,25,50')
  .split(',')
  .map(Number)
  .filter((value) => Number.isInteger(value) && value > 0);

if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || levels.length === 0) {
  throw new Error('Invalid STRESS_DURATION_SECONDS or STRESS_CONCURRENCY');
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Login failed (${login.status})`);
const { accessToken } = await login.json();
const headers = { authorization: `Bearer ${accessToken}` };

const routes = [
  '/health',
  '/auth/me',
  '/workspaces',
  '/notifications/unread-count',
  '/me/dashboard',
  '/attendance/state',
];

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function runLevel(concurrency) {
  const endAt = performance.now() + durationSeconds * 1000;
  const latencies = [];
  const statusCounts = new Map();
  let requests = 0;
  let networkErrors = 0;

  async function worker(workerId) {
    let sequence = workerId;
    while (performance.now() < endAt) {
      const route = routes[sequence++ % routes.length];
      const started = performance.now();
      try {
        const response = await fetch(`${API}${route}`, { headers });
        await response.arrayBuffer();
        statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
      } catch {
        networkErrors++;
      } finally {
        latencies.push(performance.now() - started);
        requests++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
  latencies.sort((a, b) => a - b);
  const failures = networkErrors + [...statusCounts.entries()]
    .filter(([status]) => status >= 400)
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    concurrency,
    durationSeconds,
    requests,
    requestsPerSecond: requests / durationSeconds,
    failures,
    errorRate: requests ? failures / requests : 0,
    p50Ms: percentile(latencies, 0.50),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxMs: latencies.at(-1) ?? 0,
    statuses: Object.fromEntries([...statusCounts.entries()].sort(([a], [b]) => a - b)),
  };
}

console.log(`Stress target: ${API}`);
console.log(`Routes: ${routes.join(', ')}`);
console.log(`Duration per level: ${durationSeconds}s`);

const results = [];
for (const concurrency of levels) {
  const result = await runLevel(concurrency);
  results.push(result);
  console.log(JSON.stringify(result));
}

const failed = results.some((result) => result.errorRate > 0.01 || result.p95Ms > 2_000);
if (failed) {
  console.error('Stress thresholds failed: error rate must be <= 1% and p95 <= 2000ms.');
  process.exit(1);
}
console.log('Stress thresholds passed.');
