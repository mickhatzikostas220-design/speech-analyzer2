// SSRF-safe fetch. The app fetches user-supplied website URLs server-side in a
// couple of places (the SEO/AEO advisor and Brand Kit extraction). A plain
// `fetch(url, { redirect: 'follow' })` with only a string-based hostname check
// is bypassable two ways:
//   1. Redirects — the URL passes the blocklist, then 30x-redirects into
//      http://169.254.169.254/ (cloud metadata) or http://127.0.0.1/.
//   2. DNS rebinding — a normal-looking hostname whose A record resolves to a
//      private/link-local IP.
//
// This helper closes both: it resolves the hostname to its actual IP(s) and
// rejects any that fall in a private/loopback/link-local range, and it follows
// redirects manually, re-validating every hop. Scheme is restricted to http(s).
//
// Note: this does not fully defeat a determined DNS-rebinding race (the IP can
// change between our lookup and the socket connect). Closing that last gap needs
// pinning the resolved IP onto the connection, which Node's fetch doesn't expose
// cleanly — but validating resolved IPs + manual redirects removes the practical
// attack surface here (untrusted redirects and literal-private targets).
import { lookup } from 'dns/promises';
import net from 'net';

export class BlockedUrlError extends Error {}

/** True for loopback / private / link-local / reserved IP literals. */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const h = ip.toLowerCase();
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fe80')) return true; // link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local
    if (h.startsWith('::ffff:')) return isPrivateIp(h.slice('::ffff:'.length)); // IPv4-mapped
    return false;
  }
  return true; // unparseable → treat as unsafe
}

/**
 * Throw BlockedUrlError unless `rawUrl` is an http(s) URL whose host resolves to
 * a public IP. Call this before fetching a user-influenced URL.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('Invalid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https URLs are allowed.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase(); // strip IPv6 brackets
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new BlockedUrlError('That address is not allowed.');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError('That address is not allowed.');
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError('That address could not be resolved.');
  }
  if (addrs.length === 0) throw new BlockedUrlError('That address could not be resolved.');
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new BlockedUrlError('That address is not allowed.');
  }
}

/**
 * fetch() that validates the target (and every redirect hop) against
 * assertPublicUrl and follows redirects manually. Any `redirect` set on `init`
 * is ignored — redirects are always handled here so each hop is re-checked.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 4;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
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
