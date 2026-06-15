import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // RLS also scopes this to the owner; the user_id filter is belt-and-suspenders.
  const { error } = await supabase.from('gigs').delete().eq('id', params.id).eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: 'Could not remove the gig.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
