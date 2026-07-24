// SSRF guard for any server-side fetch of a user-supplied URL.
//
// The app lets signed-in speakers point us at their own website (brand
// extraction, SEO/AEO audit). That means we fetch arbitrary URLs on the
// server, which is a classic server-side request forgery (SSRF) risk: without
// a guard, someone could aim us at http://169.254.169.254/ (cloud metadata),
// http://127.0.0.1/ (internal services), or a private-range host.
//
// What this covers:
//   • only http(s) schemes
//   • the URL parser normalizes decimal/hex/octal IP literals (e.g.
//     http://2130706433/ -> 127.0.0.1), so an IP check after parsing catches
//     those encodings
//   • DNS resolution of the hostname, rejecting if ANY resolved address is in a
//     private/reserved range (catches a public-looking name that resolves to an
//     internal IP)
//   • redirects are followed manually and every hop is re-validated, so a public
//     host can't 302 us to an internal one
//
// Residual risk worth knowing: this does not pin the socket to the validated
// IP, so a determined DNS-rebinding attacker (a host that resolves to a public
// IP for our check and a private IP microseconds later for the fetch) is not
// fully stopped. Closing that needs a custom undici dispatcher; noted for
// follow-up. Everything short of that is blocked here.

import { lookup } from 'dns/promises';
import net from 'net';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed -> treat as unsafe
  }
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // drop any zone id
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  if (addr.startsWith('fe80')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
  const mapped = addr.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/** True if the literal IP is in a private, loopback, link-local, or reserved range. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true; // unknown format -> unsafe
}

/**
 * Throw SsrfError unless `rawUrl` is an http(s) URL whose host is public.
 * Resolves DNS and rejects if any resolved address is private/reserved.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed.');
  }

  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Host is already an IP literal (the URL parser normalizes decimal/hex/octal).
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new SsrfError('Refusing to fetch a private or reserved address.');
    return;
  }

  const lower = host.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  ) {
    throw new SsrfError('Refusing to fetch an internal host.');
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new SsrfError('Could not resolve that host.');
  }
  if (records.length === 0) throw new SsrfError('Could not resolve that host.');
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new SsrfError('Refusing to fetch a private or reserved address.');
    }
  }
}

/**
 * fetch() wrapper that validates the URL and every redirect hop against the
 * SSRF guard. Redirects are followed manually (max 5) so an allowed host can't
 * bounce us to an internal one. The returned Response body is unread — callers
 * read it exactly as they would a normal fetch response.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let url = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpUrl(url);
    const res = await fetch(url, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      // Discard the redirect body and re-validate the next hop.
      res.body?.cancel?.().catch(() => {});
      url = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError('Too many redirects.');
}
