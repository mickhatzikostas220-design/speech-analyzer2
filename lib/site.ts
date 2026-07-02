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
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  'https://speech-analyzer2-rkgj-98j31c1nf.vercel.app'
).replace(/\/$/, '');

export const SITE_NAME = 'Speaker Hub';

export const SITE_TAGLINE = 'Every tool a speaker needs, in one place.';

export const SITE_DESCRIPTION =
  'Speaker Hub is the all-in-one workspace for professional speakers — analyze your talks with AI, sharpen your scripts, manage bookings, cut shareable clips, and keep everything unmistakably on-brand.';
