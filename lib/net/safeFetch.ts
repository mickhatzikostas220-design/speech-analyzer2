import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * SSRF-hardened `fetch` for URLs that originate from end users (brand
 * extraction from a speaker's website, connecting a calendar by ICS URL).
 *
 * Without this, a user could point us at `http://169.254.169.254/...`
 * (cloud metadata), `http://localhost:...`, or an external host that
 * 302-redirects to one of those, and have our server make the request from
 * inside the trust boundary. We:
 *   1. allow only http/https on ports 80/443,
 *   2. resolve the hostname and reject private / loopback / link-local IPs,
 *   3. follow redirects manually, re-validating every hop.
 */

export class SsrfError extends Error {}

const MAX_REDIRECTS = 4;

function ipToBytes(ip: string): number[] | null {
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    return parts.length === 4 && parts.every((n) => n >= 0 && n <= 255) ? parts : null;
  }
  return null;
}

/** True for IPs that must never be reachable from a user-supplied URL. */
function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const b = ipToBytes(ip);
    if (!b) return true;
    const [a, b1] = b;
    if (a === 0) return true; // "this" network
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b1 === 254) return true; // link-local + cloud metadata
    if (a === 172 && b1 >= 16 && b1 <= 31) return true; // private
    if (a === 192 && b1 === 168) return true; // private
    if (a === 100 && b1 >= 64 && b1 <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // not a recognizable IP — refuse
}

async function assertHostAllowed(hostname: string): Promise<void> {
  // Literal IP in the URL — check directly.
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new SsrfError('That address is not allowed.');
    return;
  }
  // Resolve and reject if ANY returned address is internal.
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfError('Could not resolve that host.');
  }
  if (records.length === 0) throw new SsrfError('Could not resolve that host.');
  for (const r of records) {
    if (isBlockedIp(r.address)) throw new SsrfError('That address is not allowed.');
  }
}

function assertUrlAllowed(u: URL): void {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed.');
  }
  if (u.port && u.port !== '80' && u.port !== '443') {
    throw new SsrfError('That port is not allowed.');
  }
}

/**
 * Fetch a user-supplied URL with SSRF protection. Redirects are followed
 * manually so each hop's host is re-validated. Throws SsrfError on any
 * disallowed target; other fetch errors propagate as usual.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  let current = new URL(rawUrl);

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertUrlAllowed(current);
    await assertHostAllowed(current.hostname);

    const res = await fetch(current.toString(), { ...init, redirect: 'manual' });

    // 3xx with a Location → validate the next hop ourselves.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, current);
      continue;
    }
    return res;
  }
  throw new SsrfError('Too many redirects.');
}
