// The list of public, indexable URLs, served at /sitemap.xml. Marketing / entry
// pages plus every published speaker one-sheet — the signed-in app is private
// and excluded. Regenerated hourly so newly published one-sheets show up on
// their own, without a redeploy.

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { listPublicOneSheetSlugs } from '@/lib/onesheet/server';

// Re-run at most once an hour: fresh enough that new one-sheets appear quickly,
// but crawlers still hit a cached file almost every time instead of the DB.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/donate', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/signup', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/login', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
  ];

  const staticEntries: MetadataRoute.Sitemap = routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Published speaker one-sheets live at /s/<slug> and are fully public pages,
  // so we add each one to help search engines and AI find and cite it. If the
  // lookup fails (e.g. missing service-role key at build time) it returns [],
  // so the static entries above still ship.
  const oneSheets = await listPublicOneSheetSlugs();
  const oneSheetEntries: MetadataRoute.Sitemap = oneSheets.map((s) => ({
    url: `${SITE_URL}/s/${s.slug}`,
    lastModified: s.createdAt ? new Date(s.createdAt) : now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticEntries, ...oneSheetEntries];
}
