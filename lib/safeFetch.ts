// SSRF-hardened fetch for user-supplied URLs (SEO scraper, brand extractor).
//
// A plain `fetch(url, { redirect: 'follow' })` guarded only by a string check on
// the *submitted* hostname is not enough: an attacker can (a) submit a public
// hostname whose DNS resolves to a private/link-local IP, or (b) submit a public
// URL that 30x-redirects to `http://169.254.169.254/…` (cloud metadata) or an
// internal service. This helper closes both holes by resolving DNS and checking
// every resolved IP up front, and by following redirects MANUALLY so each hop is
// re-validated before we ever open the connection.
import { lookup } from 'dns/promises';
import net from 'net';

export class SafeFetchError extends Error {}

/** True for loopback/private/link-local/reserved addresses we must never reach. */
export function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved / broadcast
    return false;
  }
  if (type === 6) {
    const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (v === '::1' || v === '::') return true; // loopback / unspecified
    if (v.startsWith('fe80')) return true; // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique-local
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4 address.
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]!);
    return false;
  }
  return true; // not a literal IP → treat as unsafe
}

/** Resolve a hostname and reject if ANY resolved address is private/reserved. */
async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new SafeFetchError('That address is not allowed.');
  }
  // If it's already an IP literal, check it directly (skip DNS).
  if (net.isIP(h)) {
    if (isPrivateIp(h)) throw new SafeFetchError('That address is not allowed.');
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new SafeFetchError('That address could not be resolved.');
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new SafeFetchError('That address is not allowed.');
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch a user-supplied URL with SSRF protection. Returns the decoded body
 * (capped at maxBytes) and the final URL after any redirects. Only http/https
 * are permitted, and every hop's host is DNS-checked before we connect.
 */
export async function safeFetchHtml(
  startUrl: string,
  opts: SafeFetchOptions = {}
): Promise<{ html: string; finalUrl: string }> {
  const timeoutMs = opts.timeoutMs ?? 9000;
  const maxBytes = opts.maxBytes ?? 800_000;
  const maxRedirects = opts.maxRedirects ?? 5;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = startUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const u = new URL(current);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new SafeFetchError('That address is not allowed.');
      }
      await assertPublicHost(u.hostname);

      const res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          ...(opts.headers ?? {}),
        },
      });

      // Manual redirect handling so we re-validate the destination host.
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop === maxRedirects) throw new SafeFetchError('Too many redirects.');
        current = new URL(res.headers.get('location')!, current).toString();
        continue;
      }

      if (!res.ok) throw new SafeFetchError(`The site responded with ${res.status}.`);
      const buf = await res.arrayBuffer();
      const html = new TextDecoder('utf-8').decode(buf.slice(0, maxBytes));
      return { html, finalUrl: res.url || current };
    }
    throw new SafeFetchError('Too many redirects.');
  } finally {
    clearTimeout(timer);
  }
}
