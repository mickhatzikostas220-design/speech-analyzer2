import { lookup } from 'dns/promises';
import net from 'net';

/**
 * SSRF protection for server-side fetches of user-supplied URLs.
 *
 * Routes like brand extraction and calendar (ICS) import fetch an arbitrary
 * URL the user hands us. Without guarding, a user can point those at internal
 * services or the cloud metadata endpoint (169.254.169.254) to probe the
 * private network or exfiltrate credentials. We restrict to http(s) on the
 * standard ports and reject any hostname that resolves to a private,
 * loopback, link-local, or otherwise non-public address.
 */
export class SsrfError extends Error {}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format -> block
}

/**
 * Validate a user-supplied URL is safe to fetch. Resolves the hostname and
 * rejects private/loopback/link-local targets. Returns the parsed URL.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL.');
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('Only http(s) URLs are allowed.');
  }
  if (u.port && !['', '80', '443'].includes(u.port)) {
    throw new SsrfError('Only ports 80 and 443 are allowed.');
  }

  const host = u.hostname.replace(/^\[|\]$/g, '');

  // If the host is already a literal IP, check it directly.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new SsrfError('That address is not allowed.');
    return u;
  }

  // Resolve all A/AAAA records and ensure none point to a private range.
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new SsrfError('Could not resolve that host.');
  }
  if (records.length === 0) throw new SsrfError('Could not resolve that host.');
  for (const r of records) {
    if (isBlockedAddress(r.address)) throw new SsrfError('That host resolves to a blocked address.');
  }
  return u;
}

/**
 * fetch() wrapper that validates the URL (and every redirect hop) against the
 * SSRF allow-list. Uses manual redirect handling so a public URL can't 302 to
 * an internal one.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 4): Promise<Response> {
  let current = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertSafeUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location')!, current).toString();
      current = next;
      continue;
    }
    return res;
  }
  throw new SsrfError('Too many redirects.');
}
