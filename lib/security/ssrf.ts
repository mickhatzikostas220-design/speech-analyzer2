// SSRF guard for server-side fetches of user-supplied URLs (brand extraction,
// SEO audit). The app lets speakers point us at "their website" and we fetch it
// from our servers — so without a guard, a user could aim us at internal-only
// addresses (cloud metadata at 169.254.169.254, localhost admin panels, private
// 10./192.168. hosts) and read the response back through the tool output.
//
// Defense in depth, three layers:
//   1. Scheme allowlist — only http/https.
//   2. Host + resolved-IP check — block localhost, link-local, private, and
//      reserved ranges. We resolve DNS and check every A/AAAA record, so a
//      public hostname that points at a private IP is still rejected.
//   3. Per-hop redirect validation — we follow redirects manually and re-run
//      the check on each Location, so an allowed host can't 302 us to an
//      internal one.
//
// Residual risk: DNS rebinding (the name resolves public here but private when
// fetch() re-resolves) is not fully closed, because the global fetch() does its
// own DNS lookup we can't pin. It's a much narrower window than the wide-open
// state this replaces, and noted here so it isn't mistaken for airtight.

import { lookup } from 'dns/promises';
import net from 'net';

export class BlockedUrlError extends Error {}

const MAX_REDIRECTS = 4;

/** True for loopback, link-local, private, CGNAT, and reserved IP literals. */
export function isPrivateIp(input: string): boolean {
  let addr = input.trim().replace(/^\[|\]$/g, '');
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) addr = mapped[1];

  if (net.isIPv4(addr)) {
    const p = addr.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(addr)) {
    const h = addr.toLowerCase();
    if (h === '::1' || h === '::') return true; // loopback / unspecified
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local
    if (h.startsWith('fe80')) return true; // link-local
    return false;
  }

  return false; // not an IP literal — hostname is resolved separately
}

/** Fast string prefilter for obviously-internal hostnames (before DNS). */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIP(h) && isPrivateIp(h)) return true;
  return false;
}

/**
 * Throw BlockedUrlError unless `rawUrl` is a public http(s) address. Resolves
 * DNS and rejects if the host (or any resolved IP) is internal/reserved.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('That address is not a valid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https addresses can be fetched.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHost(host)) {
    throw new BlockedUrlError('That address points to a private network.');
  }
  // Literal IP already covered by isBlockedHost; only hostnames need resolving.
  if (net.isIP(host)) return;

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError("Couldn't resolve that website address.");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new BlockedUrlError('That address points to a private network.');
  }
}

/**
 * fetch() that follows redirects manually, validating every hop against
 * assertPublicUrl. Callers keep their own timeout/AbortSignal, headers, and
 * body-reading logic; pass `redirect` is ignored (always manual internally).
 * Returns the final Response and the final URL reached.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {}
): Promise<{ response: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const response = await fetch(current, { ...init, redirect: 'manual' });
    const status = response.status;
    const location = response.headers.get('location');
    if (status >= 300 && status < 400 && location) {
      // Resolve relative redirects against the current URL, then re-validate.
      current = new URL(location, current).toString();
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new BlockedUrlError('That website redirected too many times.');
}
