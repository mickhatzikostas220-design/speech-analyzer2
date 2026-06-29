// Shared SSRF guard for the routes that fetch a user-supplied URL server-side
// (SEO advisor, brand auto-extract, calendar/.ics import). Each of those used
// `fetch(url, { redirect: 'follow' })` with at most a string-based host check,
// which is bypassable two ways: a public hostname that resolves to a private
// IP (DNS rebinding), and a public URL that 302-redirects to an internal one.
//
// `safeFetch` closes both: it resolves the host and rejects any private /
// loopback / link-local / cloud-metadata address BEFORE connecting, follows
// redirects manually, and re-validates every hop. Residual TOCTOU DNS-rebind
// risk remains (the OS may re-resolve at connect time) but the redirect and
// direct-internal vectors — the practical ones here — are closed.
import { lookup } from 'dns/promises';

export class BlockedHostError extends Error {}

const MAX_REDIRECTS = 5;

/** True for IPs that must never be reachable from a server-side fetch. */
function isPrivateIp(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4 (also handles IPv4-mapped IPv6 like ::ffff:10.0.0.1).
  const v4 = addr.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4) {
    const parts = v4[1].split('.').map(Number);
    if (parts.some((n) => Number.isNaN(n) || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 127) return true; // this-host, loopback
    if (a === 10) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6.
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  if (addr.startsWith('fe80')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('ff')) return true; // multicast
  return false;
}

/**
 * Throw BlockedHostError unless `hostname` resolves only to public addresses.
 * Rejects obvious internal names outright and resolves everything else.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) {
    throw new BlockedHostError('That address is not allowed.');
  }
  // A bare IP literal in the URL — check it directly.
  if (/^[\d.]+$/.test(h) || h.includes(':')) {
    if (isPrivateIp(h)) throw new BlockedHostError('That address is not allowed.');
    return;
  }
  let records: { address: string }[];
  try {
    records = await lookup(h, { all: true });
  } catch {
    throw new BlockedHostError('Could not resolve that address.');
  }
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
    throw new BlockedHostError('That address is not allowed.');
  }
}

/**
 * Drop-in `fetch` that validates the host of the initial URL and of every
 * redirect target against the private-IP blocklist. Pass through the usual
 * RequestInit (signal, headers, …) — `redirect` is forced to 'manual'.
 */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BlockedHostError('Only http(s) addresses are allowed.');
    }
    await assertPublicHost(parsed.hostname);

    const res = await fetch(current, { ...init, redirect: 'manual' });
    // 3xx with a Location header → validate and follow manually.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new BlockedHostError('Too many redirects.');
}
