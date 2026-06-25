import { lookup } from 'dns/promises';
import net from 'net';

// SSRF guard for server-side fetches of user-supplied URLs.
//
// Any feature that takes a URL from a user and fetches it server-side (brand
// extraction, future webhook/import flows) must route through this module so an
// attacker can't point us at internal infrastructure (cloud metadata at
// 169.254.169.254, localhost, RFC-1918 ranges, etc.) or bounce there via a
// redirect.

export class SsrfError extends Error {}

/** True if an IP literal is in a private, loopback, link-local, or reserved range. */
export function isBlockedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIpv4(ip);
  if (type === 6) return isBlockedIpv6(ip);
  return true; // not a parseable IP → reject
}

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0/24 IETF
  if (a === 192 && b === 0 && p[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark
  if (a >= 224) return true; // multicast + reserved (224+)
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

/**
 * Validate that a URL is safe to fetch server-side: must be http(s), must have a
 * hostname, and every IP its hostname resolves to must be publicly routable.
 * Throws SsrfError otherwise. Returns the parsed URL.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed.');
  }
  const host = u.hostname;
  if (!host) throw new SsrfError('URL has no host.');

  // If the host is already an IP literal, check it directly.
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfError('That address is not allowed.');
    return u;
  }

  // Resolve the hostname and reject if ANY resolved address is non-public
  // (defeats DNS-rebinding-style answers that include an internal A record).
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new SsrfError('Could not resolve that host.');
  }
  if (!records.length) throw new SsrfError('Could not resolve that host.');
  for (const r of records) {
    if (isBlockedIp(r.address)) throw new SsrfError('That host resolves to a non-public address.');
  }
  return u;
}

/**
 * SSRF-safe fetch: validates the initial URL and every redirect hop against
 * {@link assertPublicUrl}, following at most `maxRedirects` hops manually
 * (`redirect: 'manual'`) so a 30x into an internal address can't slip through.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 4
): Promise<Response> {
  let current = rawUrl;
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
  throw new SsrfError('Too many redirects.');
}
