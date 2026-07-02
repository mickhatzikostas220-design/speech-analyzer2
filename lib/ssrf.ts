import { lookup } from 'dns/promises';
import net from 'net';

// SSRF guard for the two places the server fetches a user-supplied website URL
// (brand extraction and the SEO advisor). A signed-in user controls the URL, so
// without this they could make the server reach internal-only resources:
// localhost services, link-local cloud-metadata endpoints (169.254.169.254),
// or private-network hosts.
//
// The check is DNS-aware — it resolves the hostname and rejects if ANY resolved
// address is private/loopback/link-local/reserved — because a public-looking
// domain can still point at an internal IP. Callers must also re-validate every
// redirect hop (see assertFetchableUrl + fetchWithSsrfGuard), since a public URL
// can 3xx-redirect to an internal one.
//
// Residual risk: DNS rebinding (the name re-resolves to a private IP between our
// lookup and fetch's own lookup) is not fully closed here; closing it needs
// pinning the connection to the validated IP. This still blocks the practical
// attacks (direct private URLs, redirects, and static internal hostnames).

export class SsrfError extends Error {}

/** True for IPv4/IPv6 addresses that must never be fetched server-side. */
export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // "this", private, loopback
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (kind === 6) {
    const h = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === '::1' || h === '::') return true; // loopback / unspecified
    if (h.startsWith('fe80')) return true; // link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local
    const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateAddress(mapped[1]); // IPv4-mapped IPv6
    return false;
  }
  return false;
}

/**
 * Throw SsrfError unless `rawUrl` is an http(s) URL whose host is public.
 * Resolves DNS for hostnames so a public name that maps to a private IP is
 * still rejected.
 */
export async function assertFetchableUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL.');
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new SsrfError('Only http and https URLs are allowed.');
  }

  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) {
    throw new SsrfError('That address is not allowed.');
  }

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new SsrfError('That address is not allowed.');
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SsrfError("Couldn't resolve that website address.");
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new SsrfError('That address is not allowed.');
  }
}

export interface SsrfFetchResult {
  response: Response;
  finalUrl: string;
}

/**
 * fetch() with SSRF protection that survives redirects: every hop (including
 * the initial URL) is validated with assertFetchableUrl before the request is
 * made. Redirects are followed manually up to `maxRedirects`.
 */
export async function fetchWithSsrfGuard(
  startUrl: string,
  init: RequestInit,
  maxRedirects = 4
): Promise<SsrfFetchResult> {
  let current = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertFetchableUrl(current);
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, finalUrl: current };
      current = new URL(location, current).toString();
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new SsrfError('Too many redirects.');
}
