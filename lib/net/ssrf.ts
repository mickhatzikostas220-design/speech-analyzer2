/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * Several tools fetch a URL the user typed in (brand extraction from a
 * speaker's site, connecting an iCal feed, reading a page for SEO). Without a
 * guard, a signed-in user could aim those fetches at localhost, a
 * private-network service, or the cloud metadata endpoint (169.254.169.254) and
 * read the response back through the tool's output. We validate both the
 * hostname string AND the IP addresses it resolves to (a public hostname can
 * point at a private address), and we re-validate every redirect hop.
 *
 * Node runtime only (uses node:dns). Routes that call this must run with
 * `export const runtime = 'nodejs'`.
 */
import { lookup } from 'node:dns/promises';

export class BlockedHostError extends Error {}

/** Block obvious SSRF targets by hostname (localhost, private/link-local ranges). */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, ''); // strip trailing dot
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

/**
 * Block private / loopback / link-local / reserved IPs, checked against the
 * address a hostname actually resolves to (catches names pointing at internal
 * hosts, which the string check above can't see).
 */
export function isBlockedIp(ip: string): boolean {
  const addr = ip.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — check the embedded v4 address.
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const v4 = mapped ? mapped[1] : addr;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4)) {
    const [a, b] = v4.split('.').map(Number);
    if (a === 127 || a === 10 || a === 0) return true; // loopback, private, "this host"
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6
  if (addr === '::1' || addr === '::') return true;
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('fe80')) return true; // link-local
  return false;
}

/**
 * Assert a host is safe to fetch: hostname not blocked, and none of the IPs it
 * resolves to are private/reserved. Throws BlockedHostError if it isn't.
 * A DNS-resolution failure is left to surface as a normal fetch error.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (!hostname || isBlockedHost(hostname)) {
    throw new BlockedHostError("That address can't be reached.");
  }
  try {
    const addrs = await lookup(hostname, { all: true });
    if (addrs.some((a) => isBlockedIp(a.address))) {
      throw new BlockedHostError("That address can't be reached.");
    }
  } catch (err) {
    if (err instanceof BlockedHostError) throw err;
    // DNS failure — let the caller's fetch surface a clean "couldn't reach" error.
  }
}

/**
 * fetch() wrapper that validates every hop against the SSRF guard. Redirects are
 * followed manually (up to `maxRedirects`) so the redirect *target* is checked
 * too — `redirect: 'follow'` would let a public URL bounce us to an internal one.
 * Throws BlockedHostError for a blocked/non-http(s) target.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxRedirects = 4
): Promise<Response> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BlockedHostError("That address can't be reached.");
    }
    await assertPublicHost(parsed.hostname);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new BlockedHostError('That site redirected too many times.');
}
