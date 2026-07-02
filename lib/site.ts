// Central site identity constants used by app/layout.tsx metadata (and anywhere
// else that needs the canonical name/URL). This file was referenced by the
// "Fix build-time environment handling" commit but never committed — recreating
// it here fixes the production build.

export const SITE_NAME = 'Speaker Hub';
export const SITE_TAGLINE = 'AI tools for public speakers';
export const SITE_DESCRIPTION =
  'A hub of AI-powered tools that help public speakers prepare, analyze, and improve their performances.';

// Canonical URL for metadata (Open Graph, canonical links). Prefer the
// configured app URL; fall back to the deployed Vercel URL.
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://speech-analyzer2-rkgj-98j31c1nf.vercel.app';
