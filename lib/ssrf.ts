// Shared SSRF guard for endpoints that fetch user-supplied URLs (SEO analyzer,
// brand extractor, calendar/ICS import). Blocks obvious internal targets so a
// signed-in user can't point the server at localhost, link-local, or private
// ranges (e.g. cloud metadata at 169.254.169.254).
//
// NOTE: this is a hostname/IP-literal check performed BEFORE the request. It
// does not resolve DNS, and fetches that follow redirects could still be
// redirected to a private address. Callers that follow redirects should keep
// this as defense-in-depth, not a complete guarantee.
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  // IPv4 private / loopback / link-local / "this network" ranges.
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  // IPv6 loopback + unique-local (fc00::/7).
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

/** True when the URL is an http(s) URL whose host is not an internal target. */
export function isSafeFetchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return !isBlockedHost(u.hostname);
  } catch {
    return false;
  }
}
