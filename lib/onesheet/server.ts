import { createAdminClient } from '@/lib/supabase/admin';
import { mergeBrand } from '@/lib/brand/theme';
import type { BrandKit } from '@/lib/brand/types';

/** URL-safe slug from a name/handle. */
export function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export interface PublicOneSheet {
  userId: string;
  slug: string;
  brand: BrandKit;
}

/** Public lookup of a published one-sheet by slug (service role, no auth). */
export async function getProfileBySlug(slug: string): Promise<PublicOneSheet | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('id, brand, slug')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return null;
    return { userId: data.id as string, slug: data.slug as string, brand: mergeBrand(data.brand ?? undefined) };
  } catch {
    return null;
  }
}

export interface PublicOneSheetRef {
  slug: string;
  createdAt: string | null;
}

/**
 * Every published one-sheet, for the public sitemap. A profile row with a
 * non-empty `slug` has a live page at /s/<slug>, so listing them lets search
 * engines and AI answer engines discover each speaker's public page.
 */
export async function listPublicOneSheetSlugs(): Promise<PublicOneSheetRef[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('slug, created_at')
      .not('slug', 'is', null)
      .neq('slug', '');
    if (error || !data) return [];
    return (data as Array<{ slug: string | null; created_at: string | null }>)
      .filter((r): r is { slug: string; created_at: string | null } => Boolean(r.slug))
      .map((r) => ({ slug: r.slug, createdAt: r.created_at }));
  } catch {
    return [];
  }
}
