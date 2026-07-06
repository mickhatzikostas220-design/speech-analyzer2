// Central place for the canonical public site URL and marketing constants.
// Everything that needs an absolute URL (metadata, sitemap, robots, OG image,
// manifest) reads from here so there is a single source of truth.
//
// Resolution order:
//   1. NEXT_PUBLIC_SITE_URL  — optional override for the public marketing URL.
//   2. NEXT_PUBLIC_APP_URL   — the app URL already configured for email/OAuth.
//   3. VERCEL_URL            — the current deployment URL (preview/prod).
//   4. Hardcoded fallback    — so local dev and misconfig still render.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  // In production the canonical host is the real domain — never VERCEL_URL,
  // which is a per-deployment *.vercel.app URL behind Vercel SSO. Advertising
  // that in sitemap/robots/OG/emails would point visitors at a login wall.
  (process.env.VERCEL_ENV === 'production' ? 'https://speaker-hub.com' : '') ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  'https://speaker-hub.com'
).replace(/\/$/, '');

export const SITE_NAME = 'Speaker Hub';

export const SITE_TAGLINE = 'Every tool a speaker needs, in one place.';

export const SITE_DESCRIPTION =
  'Speaker Hub is the all-in-one workspace for professional speakers — analyze your talks with AI, sharpen your scripts, manage bookings, cut shareable clips, and keep everything unmistakably on-brand.';

// Public contact details shown in the site footer and pointed at by support copy.
// The email must stay on the owned, verified domain (speaker-hub.com) — it is the
// same address used in the Terms of Service. Don't invent an address on a domain
// the business doesn't control.
export const SITE_CONTACT_EMAIL = 'support@speaker-hub.com';

// Mick's public LinkedIn — the human behind the project. Also used on /about.
export const FOUNDER_LINKEDIN = 'https://www.linkedin.com/in/mick-hatzikostas-b655a3405/';
