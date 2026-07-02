import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePlan } from '@/lib/subscription/requirePlan';
import { getUserBrandState } from '@/lib/brand/server';
import { mergeBrand } from '@/lib/brand/theme';
import { generateGreeting } from '@/lib/brand/greeting';

export const runtime = 'nodejs';

/** GET /api/brand — the current speaker's saved brand + onboarding state. */
export async function GET() {
  const state = await getUserBrandState();
  if (!state.userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  return NextResponse.json(state);
}

/**
 * PUT /api/brand  { brand, websiteUrl?, onboard? }
 * Saves the speaker's brand to their profile (RLS scopes it to them).
 * Pass `onboard: true` to mark onboarding complete.
 */
export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { brand?: unknown; websiteUrl?: string; onboard?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Brand editing is Core Premium. Onboarding (which sets a new speaker's initial
  // brand + name) must work on the free plan, so only gate non-onboarding saves.
  if (!body.onboard) {
    const gate = await requirePlan(supabase, 'core');
    if (gate) return gate;
  }

  const brand = mergeBrand(body.brand);
  if (!brand.voice.greeting) brand.voice.greeting = generateGreeting(brand);

  const update: Record<string, unknown> = {
    brand,
    display_name: brand.name,
  };
  if (typeof body.websiteUrl === 'string') update.website_url = body.websiteUrl || null;
  else if (brand.sourceUrl) update.website_url = brand.sourceUrl;
  if (body.onboard) update.onboarded_at = new Date().toISOString();

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
  if (error) {
    console.error('[brand] save failed', error);
    return NextResponse.json(
      { error: 'Could not save your brand. Make sure the brand columns migration has run.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ brand });
}
