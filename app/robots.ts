import type { MetadataRoute } from 'next';

// Orator is invite-only — keep the whole app out of search indexes,
// consistent with the `robots: noindex` directive in the root metadata.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
