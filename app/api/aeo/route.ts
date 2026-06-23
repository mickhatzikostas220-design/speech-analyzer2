import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAeoState } from '@/lib/aeo/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const state = await getAeoState(supabase, user.id);
  return NextResponse.json(state);
}
