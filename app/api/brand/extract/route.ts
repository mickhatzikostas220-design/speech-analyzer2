import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractBrandFromUrl, BrandExtractError } from '@/lib/brand/extract';
import { generateGreeting } from '@/lib/brand/greeting';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/brand/extract  { url }
 * Auto-extracts a brand kit from the speaker's website and returns it
 * (without saving). Used by the onboarding + settings preview.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You need to be signed in.' }, { status: 401 });

  let url = '';
  try {
    url = (await req.json())?.url ?? '';
  } catch {
    // fall through to validation error below
  }

  try {
    const brand = await extractBrandFromUrl(url);
    brand.voice.greeting = generateGreeting(brand);
    return NextResponse.json({ brand });
  } catch (err) {
    if (err instanceof BrandExtractError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[brand/extract] unexpected error', err);
    return NextResponse.json(
      { error: 'Something went wrong reading that site. You can set your brand by hand.' },
      { status: 500 }
    );
  }
}
