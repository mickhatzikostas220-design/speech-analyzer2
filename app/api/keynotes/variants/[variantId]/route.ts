// Keynote Tailoring — delete a single industry-tailored variant ("branch").
// DELETE /api/keynotes/variants/:variantId
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { variantId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // RLS restricts the delete to variants the signed-in user owns; the explicit
  // user_id filter keeps it safe even if that policy is ever dropped.
  const { error } = await supabase
    .from('keynote_variants')
    .delete()
    .eq('id', params.variantId)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
