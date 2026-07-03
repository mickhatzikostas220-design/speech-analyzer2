// Tells search-engine crawlers what they may index. Public marketing pages are
// open; the signed-in app, auth flows, admin, and API routes are kept out of
// the index. Next.js serves this at /robots.txt automatically.

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/auth/',
        '/dashboard',
        '/analysis',
        '/analyze',
        '/history',
        '/editor',
        '/compare',
        '/onboarding',
        '/settings',
        '/agent',
        '/bookings',
        '/clipflow',
        '/tips',
        '/seo',
        '/stagefinder',
        '/verify-email',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
