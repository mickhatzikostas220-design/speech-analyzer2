import { createClient } from '@/lib/supabase/server';
import { mergeBrand } from './theme';
import { cloneDefaultBrand } from './defaults';
import type { BrandKit } from './types';

export interface UserBrandState {
  userId: string | null;
  brand: BrandKit;
  onboarded: boolean;
  websiteUrl: string | null;
}

/**
 * Load the signed-in speaker's brand from their profile. Defensive by
 * design: if the brand columns aren't migrated yet (or anything errors),
 * we return the default kit and treat the user as onboarded so the app
 * never traps anyone in the onboarding flow.
 */
export async function getUserBrandState(): Promise<UserBrandState> {
  const fallback: UserBrandState = {
    userId: null,
    brand: cloneDefaultBrand(),
    onboarded: true,
    websiteUrl: null,
  };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fallback;

  const { data, error } = await supabase
    .from('profiles')
    .select('brand, onboarded_at, website_url, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) {
    return { ...fallback, userId: user.id };
  }

  const brand = mergeBrand(data.brand ?? undefined);
  if (data.display_name && brand.source === 'default') brand.name = data.display_name;

  return {
    userId: user.id,
    brand,
    onboarded: Boolean(data.onboarded_at),
    websiteUrl: data.website_url ?? null,
  };
}
