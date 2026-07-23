// SSRF guard for server-side "fetch a URL the user gave us" tools (brand
// extractor, SEO auditor). The danger: a signed-in user hands us a URL and we
// fetch it from inside our own network, then reflect the response back to them.
// Without this, http://169.254.169.254/ (cloud metadata), http://127.0.0.1/,
// and private-range hosts are all reachable — and a public host can 302-redirect
// into them, or a DNS-rebinding domain can resolve straight to them.
//
// What this does:
//   1. Allow only http/https.
//   2. Resolve the hostname to its actual IPs and reject any that land in a
//      private / loopback / link-local / unique-local / reserved range. A bare
//      string check (isBlockedHost) misses rebinding — resolving the DNS closes it.
//   3. Follow redirects manually and re-run the same check on every hop, so a
//      public URL can't bounce us into the internal network.
//
// Residual: a rebinding host could in theory flip between the DNS check and the
// TCP connect (TOCTOU). Closing that fully needs pinning the connection to the
// vetted IP; this guard blocks the practical exploits (literal internal IPs,
// redirect-to-internal, and hosts that resolve internal at all).
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class BlockedUrlError extends Error {
  constructor(message = 'That address points somewhere we cannot fetch.') {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/** True if an IP literal sits in a private / loopback / link-local / reserved range. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast + reserved (224.0.0.0+)
    return false;
  }
  if (v === 6) {
    let h = ip.toLowerCase();
    // Strip zone id and unwrap IPv4-mapped (::ffff:a.b.c.d) to check the v4 part.
    h = h.split('%')[0]!;
    const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]!);
    if (h === '::' || h === '::1') return true; // unspecified / loopback
    if (h.startsWith('fe80') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb'))
      return true; // link-local fe80::/10
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local fc00::/7
    if (h.startsWith('ff')) return true; // multicast
    return false;
  }
  // Not a parseable IP — treat as unsafe.
  return true;
}

/** Resolve a hostname and reject if it (or any of its IPs) is non-public. Throws BlockedUrlError. */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('That address is not a valid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https addresses are allowed.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // unwrap [::1] form

  // If the host is already an IP literal, check it directly — no DNS needed.
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError();
    return u;
  }
  // Obvious internal names, before we even resolve.
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    throw new BlockedUrlError();
  }

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError("Couldn't resolve that address.");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new BlockedUrlError();
  }
  return u;
}

/**
 * fetch() that validates the target (and every redirect hop) against
 * assertPublicUrl. Drop-in for `fetch(url, { redirect: 'follow' })` — pass the
 * same init but WITHOUT `redirect`; this follows redirects itself, safely.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let url = rawUrl;

  for (let i = 0; i <= maxRedirects; i++) {
    const validated = await assertPublicUrl(url);
    const res = await fetch(validated.toString(), { ...init, redirect: 'manual' });

    // Not a redirect → this is our response.
    if (res.status < 300 || res.status >= 400) return res;

    const location = res.headers.get('location');
    if (!location) return res; // redirect with no target — hand it back as-is
    // Resolve relative Location against the current URL, then re-validate on next loop.
    url = new URL(location, validated).toString();
  }
  throw new BlockedUrlError('That address redirected too many times.');
}
