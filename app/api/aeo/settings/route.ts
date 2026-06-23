import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAeoState, getPlan } from '@/lib/aeo/server';
import type { Cadence } from '@/lib/aeo/types';

export const runtime = 'nodejs';

const CADENCES: Cadence[] = ['daily', 'weekly', 'biweekly', 'monthly'];

export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Plan is NOT settable here — Pro is granted only by a verified Stripe payment
  // (see /api/billing/*). The profiles billing columns are also locked at the DB
  // level so a user can't grant themselves Pro by writing the row directly.

  // Cadence is a Pro feature — free users stay weekly.
  if (typeof body.cadence === 'string' && CADENCES.includes(body.cadence as Cadence)) {
    const plan = await getPlan(supabase, user.id);
    if (plan !== 'pro' && body.cadence !== 'weekly') {
      return NextResponse.json(
        { error: 'Custom schedules are a Pro feature. Upgrade to choose your own cadence.' },
        { status: 403 }
      );
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('aeo_settings')
      .upsert(
        { user_id: user.id, cadence: body.cadence, updated_at: now },
        { onConflict: 'user_id' }
      );
    if (error) {
      return NextResponse.json(
        { error: 'Could not save your schedule. Make sure the AEO migration has run.' },
        { status: 500 }
      );
    }
  }

  const state = await getAeoState(supabase, user.id);
  return NextResponse.json(state);
}

