// SSRF guard for outbound fetches of user-supplied URLs.
//
// A few tools read a speaker's own public site on their behalf: brand
// extraction (lib/brand/extract.ts) and the SEO/AEO audit (app/api/seo).
// The address comes straight from the user, so without a guard someone could
// point it at our own internal network, a cloud metadata endpoint
// (169.254.169.254), or localhost, and read back internal responses.
//
// The key idea: validate the *resolved IP*, not the string the user typed.
// That closes numeric/encoded-IP tricks (http://2130706433 == 127.0.0.1) and
// hosts that resolve to private space, which a text pattern on the hostname
// misses. We also follow redirects manually and re-check every hop, so an
// allowed public URL can't 302 us onto an internal one.
//
// Residual limitation (documented, not fixed here): a host that passes the DNS
// check and then re-resolves to a private IP at connect time (DNS rebinding)
// is not caught, because global fetch does its own resolution. Blocking that
// fully needs IP-pinned connections; it's a much narrower, higher-effort attack
// than the vectors above.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class BlockedHostError extends Error {}

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24 reserved/TEST-NET
  if (a >= 224) return true; // 224+/4 multicast + reserved
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const h = ip.toLowerCase().split('%')[0]; // drop zone id
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fe80')) return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

function ipIsPrivate(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4IsPrivate(ip);
  if (kind === 6) return ipv6IsPrivate(ip);
  return true; // not a parseable IP → block
}

/**
 * Resolve `hostname` and throw BlockedHostError unless every address it maps to
 * is a public, routable IP. Accepts a literal IP too (validated directly).
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new BlockedHostError('That address is not allowed.');
  }

  if (isIP(host)) {
    if (ipIsPrivate(host)) throw new BlockedHostError('That address is not allowed.');
    return;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new BlockedHostError('That address could not be resolved.');
  }
  if (!records.length) throw new BlockedHostError('That address could not be resolved.');
  for (const r of records) {
    if (ipIsPrivate(r.address)) throw new BlockedHostError('That address is not allowed.');
  }
}

/**
 * fetch() that validates the target — and every redirect hop — against
 * assertPublicHost. Only http/https is allowed. Throws BlockedHostError when a
 * hop points at private space or the scheme/host is disallowed; other network
 * errors propagate as usual so callers can keep their existing handling.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 4;
  let current = url;

  for (let i = 0; i <= maxRedirects; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new BlockedHostError('That address is not allowed.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BlockedHostError('Only http and https addresses are allowed.');
    }
    await assertPublicHost(parsed.hostname);

    const res = await fetch(current, { ...init, redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        current = new URL(location, current).toString();
        continue;
      }
    }
    return res;
  }

  throw new BlockedHostError('Too many redirects.');
}
