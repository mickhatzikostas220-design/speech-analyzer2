/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * Any feature that fetches a URL a user typed in (brand/website extraction,
 * connected calendar ICS feeds, …) must route through `safeFetch` so the
 * server can't be coerced into hitting internal services, loopback, or the
 * cloud metadata endpoint (169.254.169.254).
 *
 * Strategy: resolve the hostname up front and reject any private/loopback/
 * link-local address, then follow redirects MANUALLY, re-validating every hop
 * (a server that 302s to http://169.254.169.254 would otherwise sail through a
 * one-time check). Runs in the Node.js runtime only (uses `dns`/`net`).
 */
import { lookup } from 'dns/promises';
import net from 'net';

export class BlockedUrlError extends Error {}

function ipToBytes(ip: string): number[] | null {
  if (net.isIPv4(ip)) return ip.split('.').map((n) => parseInt(n, 10));
  return null;
}

/** True for any address that must never be reachable from a user-driven fetch. */
export function isPrivateAddress(ip: string): boolean {
  // IPv4 (including IPv4-mapped IPv6 like ::ffff:127.0.0.1)
  const mapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const v4 = ipToBytes(mapped);
  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  return false;
}

/** Parse + validate a URL and confirm none of its resolved IPs are private. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('Invalid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http(s) URLs are allowed.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip [] from IPv6 literals

  // Literal IP host — check directly, no DNS.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError('URL resolves to a private address.');
    return url;
  }

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError('Could not resolve host.');
  }
  if (!addrs.length) throw new BlockedUrlError('Could not resolve host.');
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) {
      throw new BlockedUrlError('URL resolves to a private address.');
    }
  }
  return url;
}

/**
 * fetch() that validates the target (and every redirect hop) is a public
 * address before each request. Throws BlockedUrlError if any hop is private.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let current = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new BlockedUrlError('Too many redirects.');
}
