import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mergeBrand } from '@/lib/brand/theme';
import { slugify } from '@/lib/onesheet/server';
import type { OneSheet } from '@/lib/brand/types';

export const runtime = 'nodejs';

/** GET — current slug + one-sheet content for the signed-in speaker. */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data } = await supabase.from('profiles').select('slug, brand').eq('id', user.id).maybeSingle();
  const brand = mergeBrand(data?.brand ?? undefined);
  return NextResponse.json({ slug: data?.slug ?? null, oneSheet: brand.oneSheet ?? {}, name: brand.name });
}

/** PUT { slug, oneSheet } — publish/update the public one-sheet. */
export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { slug?: string; oneSheet?: OneSheet } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const slug = slugify(body.slug ?? '');
  if (slug.length < 3) {
    return NextResponse.json({ error: 'Pick a link of at least 3 letters/numbers.' }, { status: 422 });
  }

  // Merge the new one-sheet content into the existing brand kit.
  const { data: current } = await supabase.from('profiles').select('brand').eq('id', user.id).maybeSingle();
  const brand = mergeBrand(current?.brand ?? undefined);
  brand.oneSheet = sanitize(body.oneSheet ?? {});

  const { error } = await supabase
    .from('profiles')
    .update({ slug, brand })
    .eq('id', user.id);

  if (error) {
    // Unique-violation → slug already taken by someone else.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'That link is taken — try another.' }, { status: 409 });
    }
    console.error('[onesheet] save failed', error);
    return NextResponse.json(
      { error: 'Could not publish. Make sure the one-sheet migration has run.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ slug, oneSheet: brand.oneSheet });
}

function sanitize(o: OneSheet): OneSheet {
  const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
  return {
    headline: str(o.headline, 160),
    bio: str(o.bio, 4000),
    contactEmail: str(o.contactEmail, 200),
    topics: Array.isArray(o.topics)
      ? o.topics
          .map((t) => ({ title: str(t?.title, 160) ?? '', description: str(t?.description, 1000) }))
          .filter((t) => t.title)
          .slice(0, 8)
      : [],
    testimonials: Array.isArray(o.testimonials)
      ? o.testimonials
          .map((t) => ({ quote: str(t?.quote, 1000) ?? '', author: str(t?.author, 160), role: str(t?.role, 200) }))
          .filter((t) => t.quote)
          .slice(0, 8)
      : [],
  };
}
