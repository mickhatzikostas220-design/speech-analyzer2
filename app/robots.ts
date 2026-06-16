import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';

// Orator is invite-only — keep authenticated and admin areas out of search
// indexes while leaving the public landing/request-access pages crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/history', '/compare', '/editor', '/analysis', '/admin', '/api'],
    },
    host: APP_URL,
  };
}
