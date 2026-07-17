// Hardened outbound fetch for URLs the user supplies (Brand Extract, SEO audit).
//
// The platform fetch() will happily connect to anything, which is an SSRF
// problem when the host is user-controlled: a crafted URL can reach the cloud
// metadata service (169.254.169.254), loopback, or RFC-1918 hosts and reflect
// their responses back to the caller. Two defenses live here:
//
//   1. Block private / link-local / loopback hosts BEFORE connecting.
//   2. Follow redirects manually and re-check every hop, so a public host can't
//      302 us to an internal one — which `redirect: 'follow'` would do silently.
//
// Callers own the timeout (create an AbortController, pass its signal) so the
// same deadline covers both the redirect chain and their body read.

export function isBlockedHost(host: string): boolean {
  // Strip IPv6 brackets, lowercase for comparison.
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  // IPv4 loopback / this-host / private / link-local ranges.
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  // IPv6 loopback, unique-local (fc00::/7), link-local (fe80::/10).
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

export class BlockedHostError extends Error {
  constructor(message = 'That address points to a private or internal host, which we can’t scan.') {
    super(message);
    this.name = 'BlockedHostError';
  }
}

export interface SafeFetchOptions {
  signal: AbortSignal;
  headers?: Record<string, string>;
  maxRedirects?: number;
}

/**
 * Fetch `url`, validating the host on the initial request and on every redirect
 * hop. Throws BlockedHostError if any hop resolves to a blocked host or the URL
 * is malformed. Returns the final (non-redirect) Response; the caller reads the
 * body. Redirects are followed manually up to `maxRedirects` (default 5).
 */
export async function safeFetch(url: string, opts: SafeFetchOptions): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let host: string;
    try {
      host = new URL(current).hostname;
    } catch {
      throw new BlockedHostError('That doesn’t look like a valid website address.');
    }
    if (isBlockedHost(host)) throw new BlockedHostError();

    const res = await fetch(current, {
      redirect: 'manual',
      signal: opts.signal,
      headers: opts.headers,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res; // redirect with no target — hand it back as-is
      // Resolve relative Locations against the current URL, then loop to
      // re-validate the new host before the next hop connects.
      current = new URL(location, current).toString();
      continue;
    }

    return res;
  }

  throw new BlockedHostError('That website redirected too many times.');
}
