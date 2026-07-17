import type { Request } from 'express';

/**
 * Best-effort client IP. Prefers the left-most X-Forwarded-For entry (set by the
 * reverse proxy in front of the app) and falls back to the socket address. Kept
 * self-contained so we don't have to flip global Express `trust proxy` behaviour.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  return normalizeIp(req.ip ?? req.socket?.remoteAddress ?? '');
}

/** Strip the IPv4-mapped-IPv6 prefix so "::ffff:1.2.3.4" compares as "1.2.3.4". */
function normalizeIp(ip: string): string {
  const s = ip.trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

/** Parse the comma-separated env value into a clean list of entries. */
export function parseAllowlist(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * True if `ip` matches any entry in `allowlist`. Entries may be exact IPs or IPv4
 * CIDR blocks (e.g. "10.0.0.0/8"). An EMPTY allowlist means "no restriction" → true.
 */
export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const client = normalizeIp(ip);
  return allowlist.some((entry) => {
    if (entry.includes('/')) return ipv4InCidr(client, entry);
    return normalizeIp(entry) === client;
  });
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = (n << 8) | b;
  }
  return n >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range ?? '');
  if (ipInt === null || rangeInt === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}
