import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAeoState, releaseNextTip } from '@/lib/aeo/server';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const result = await releaseNextTip(supabase, user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, nextAvailableAt: result.nextAvailableAt ?? null },
      { status: 429 }
    );
  }

  const state = await getAeoState(supabase, user.id);
  return NextResponse.json(state);
}
