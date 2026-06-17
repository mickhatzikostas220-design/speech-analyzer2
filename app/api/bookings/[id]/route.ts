import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/bookings/types';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  const fields = ['organization', 'contact_name', 'contact_email', 'event_name', 'location', 'notes'];
  for (const f of fields) {
    if (f in b) update[f] = typeof b[f] === 'string' && (b[f] as string).trim() ? (b[f] as string).trim() : null;
  }
  if ('event_date' in b) update.event_date = b.event_date || null;
  if ('fee' in b) {
    const n = b.fee != null && b.fee !== '' ? Number(b.fee) : null;
    update.fee = n != null && !isNaN(n) ? n : null;
  }
  if ('status' in b) {
    if (!BOOKING_STATUSES.includes(b.status as BookingStatus)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 422 });
    }
    update.status = b.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Could not update the booking.' }, { status: 500 });
  }
  return NextResponse.json({ booking: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { error } = await supabase.from('bookings').delete().eq('id', params.id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not remove the booking.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
