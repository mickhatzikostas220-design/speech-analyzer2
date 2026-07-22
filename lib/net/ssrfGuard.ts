// Shared SSRF guard for the two places that fetch a user-supplied website URL
// (brand extraction and the SEO/AEO advisor). Both previously followed redirects
// blindly and only string-matched a few private IP prefixes, which let a signed-in
// user point them at cloud metadata (169.254.169.254), localhost, or internal
// hosts — including via a public URL that 302-redirects inward, or a decimal/hex
// IP encoding that a regex misses.
//
// This guard resolves DNS and rejects the request if the host (or ANY address it
// resolves to) is private, loopback, link-local, or otherwise reserved, and it
// re-validates every redirect hop. DNS resolution also normalizes decimal/hex/
// octal IP encodings to real addresses, so those are covered too.
//
// Residual risk: DNS rebinding between the check and the connect (TOCTOU) is not
// fully closed without pinning the socket to the validated IP — acceptable here
// given the endpoints are authenticated and the responses are minimally reflected.
import { lookup } from 'dns/promises';
import net from 'net';

export class SsrfError extends Error {}

// Hostnames we reject outright, before any DNS work.
const BLOCKED_HOSTNAME = /(?:^|\.)localhost$|\.local$|\.internal$|\.lan$/i;

/** True when an already-parsed IP literal points somewhere private/reserved. */
export function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const p = ip.split('.').map(Number);
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    if (p[0] === 0 || p[0] === 127 || p[0] === 10) return true; // this-host, loopback, private
    if (p[0] === 192 && p[1] === 168) return true; // private
    if (p[0] === 169 && p[1] === 254) return true; // link-local + cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // private
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast / reserved
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedIp(mapped[1]); // IPv4-mapped IPv6
    return false;
  }
  return true; // not a valid IP → refuse
}

/**
 * Parse `raw`, require an http(s) URL, and reject it if the host is private,
 * loopback, link-local, reserved, or resolves to any such address. Throws
 * SsrfError otherwise returns the parsed URL.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError('Invalid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed.');
  }
  const host = u.hostname.replace(/\.$/, '').toLowerCase();
  if (!host || BLOCKED_HOSTNAME.test(host)) throw new SsrfError('That host is not allowed.');

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfError('That host is not allowed.');
    return u;
  }

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfError('Could not resolve that host.');
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
    throw new SsrfError('That host is not allowed.');
  }
  return u;
}

/**
 * fetch() that validates the target — and every redirect hop — against
 * assertPublicHttpUrl. Redirects are followed manually so a public URL can't
 * bounce the request to an internal address. All other fetch semantics are the
 * caller's (pass a signal, headers, etc. via `init`).
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 4
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError('Too many redirects.');
}
