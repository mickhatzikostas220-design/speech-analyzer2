// Central site metadata used by the root layout for SEO / Open Graph tags.
// Kept in one place so titles, canonical URLs, and social cards stay consistent.
// SITE_URL prefers the deployment URL from the environment and falls back to the
// production Vercel URL.

export const SITE_NAME = 'Speaker Hub';
export const SITE_TAGLINE = 'Tools for public speakers';
export const SITE_DESCRIPTION =
  'Speaker Hub is a suite of tools for public speakers — analyze your talks, sharpen your delivery, turn long talks into clips, manage bookings, and grow your speaking business.';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://speech-analyzer2-rkgj-98j31c1nf.vercel.app'
).replace(/\/$/, '');
