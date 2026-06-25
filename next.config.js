/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. These are the headers
// that are safe to set globally without risking app breakage. A full
// Content-Security-Policy is intentionally left out here because this app loads
// third-party assets (Google Fonts stylesheets from extracted brand kits, the
// Remotion player, social embeds) — a CSP should be added deliberately with the
// right allowlist rather than blanket-applied.
const securityHeaders = [
  // Clickjacking: this app is never meant to be framed.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // Stop browsers from MIME-sniffing responses away from the declared type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak full URLs (which can contain ids/tokens) in the Referer header.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Force HTTPS for two years, including subdomains.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Lock down powerful browser features the app doesn't use.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
