// SSRF-safe URL validation + fetch.
//
// The app fetches user-supplied website URLs in two places (the SEO advisor and
// brand auto-extraction). Without guarding, a user could point those at internal
// hosts (cloud metadata at 169.254.169.254, localhost, private RFC-1918 ranges)
// and read the response back through scraped page signals. This module:
//   1. Rejects non-http(s) schemes.
//   2. Normalizes numeric IPv4 encodings (decimal / hex / octal) so 2130706433,
//      0x7f000001, 0177.0.0.1 etc. can't slip a loopback address past a string check.
//   3. Resolves the hostname via DNS and rejects if ANY resolved IP is private /
//      loopback / link-local / reserved (defends against DNS-rebinding-style tricks).
//   4. Follows redirects manually, re-validating every hop (a public URL that 302s
//      to an internal address is blocked).
//
// Requires the Node.js runtime (uses `dns` and `net`). Callers that import this
// must declare `export const runtime = 'nodejs'`.
import dns from 'dns/promises';
import net from 'net';

export class BlockedUrlError extends Error {}

/** Convert a single IPv4 numeric form (decimal/hex/octal) to dotted-quad, or null. */
function normalizeNumericIPv4(host: string): string | null {
  // Already dotted-quad — leave it for net.isIP.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;

  const parseInt0 = (s: string): number | null => {
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(s)) n = parseInt(s, 16);
    else if (/^0[0-7]+$/.test(s)) n = parseInt(s, 8);
    else if (/^\d+$/.test(s)) n = parseInt(s, 10);
    else return null;
    return Number.isFinite(n) ? n : null;
  };

  // Dotted forms with non-decimal parts (e.g. 0177.0.0.1, 0x7f.0.0.1).
  if (host.includes('.')) {
    const parts = host.split('.');
    if (parts.length === 4) {
      const nums = parts.map(parseInt0);
      if (nums.every((n) => n !== null && n >= 0 && n <= 255)) {
        return (nums as number[]).join('.');
      }
    }
    return null;
  }

  // Single integer form (e.g. 2130706433, 0x7f000001).
  const n = parseInt0(host);
  if (n === null || n < 0 || n > 0xffffffff) return null;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → block
  const [a, b] = p;
  if (a === 0 || a === 127) return true; // this-network, loopback
  if (a === 10) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments / 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + 255.255.255.255
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fe80') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb'))
    return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique local
  // IPv4-mapped (::ffff:127.0.0.1) — extract and check the v4 part.
  const mapped = h.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP → block, to be safe
}

/**
 * Throw a BlockedUrlError unless `rawUrl` is an http(s) URL whose host (and all of
 * its resolved IPs) are public. Safe to call on each redirect hop.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('Invalid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedUrlError('Only http(s) addresses are allowed.');
  }

  let host = u.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1); // IPv6 literal

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new BlockedUrlError('That address is not allowed.');
  }

  const numeric = normalizeNumericIPv4(host);
  if (numeric) host = numeric;

  // Literal IP — validate directly, no DNS needed.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError('That address is not allowed.');
    return;
  }

  // Hostname — resolve and reject if ANY address is private.
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError('Could not resolve that website address.');
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new BlockedUrlError('That address is not allowed.');
  }
}

/**
 * fetch() that validates the target (and every redirect hop) against
 * assertPublicUrl before issuing the request. Redirects are followed manually so
 * an attacker can't redirect a public URL to an internal one.
 */
export async function safeFetch(
  url: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<Response> {
  const { maxRedirects = 4, ...rest } = init;
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...rest, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new BlockedUrlError('Too many redirects.');
}
