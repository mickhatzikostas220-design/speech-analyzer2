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
