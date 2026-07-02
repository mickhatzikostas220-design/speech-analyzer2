/** @type {import('next').NextConfig} */

// Security headers applied to every response. These are safe defaults that
// don't require per-route allowlisting (unlike a strict CSP, which would need
// careful tuning against inline styles, Google Fonts, Supabase, and the
// YouTube embeds used by ClipFlow — left out deliberately to avoid breakage).
const securityHeaders = [
  // Force HTTPS for two years, including subdomains.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Disallow this app being framed by other origins (clickjacking protection).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Don't let browsers MIME-sniff responses away from the declared type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send only the origin on cross-origin navigations.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable powerful features the app doesn't use.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack: (config) => {
    // pdf.js (used by the Keynote Tailoring tool to read uploaded PDFs in the
    // browser) has an optional Node-only dependency on `canvas` that it never
    // needs for text extraction. Alias it to false so webpack doesn't try to
    // bundle it, which would otherwise break the build.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

module.exports = nextConfig;
