import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBookings } from '@/lib/bookings/server';
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/bookings/types';
import { requirePlan } from '@/lib/subscription/requirePlan';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const state = await getBookings(supabase, user.id);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const gate = await requirePlan(supabase, 'core');
  if (gate) return gate;

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const organization = str(b.organization);
  const event_name = str(b.event_name);
  const contact_name = str(b.contact_name);
  if (!organization && !event_name && !contact_name) {
    return NextResponse.json(
      { error: 'Add at least an event, organization, or contact.' },
      { status: 422 }
    );
  }

  const status = BOOKING_STATUSES.includes(b.status as BookingStatus)
    ? (b.status as BookingStatus)
    : 'new';
  const feeNum = b.fee != null && b.fee !== '' ? Number(b.fee) : null;

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      organization,
      event_name,
      contact_name,
      contact_email: str(b.contact_email),
      event_date: str(b.event_date),
      location: str(b.location),
      fee: feeNum != null && !isNaN(feeNum) ? feeNum : null,
      notes: str(b.notes),
      status,
      source: 'manual',
    })
    .select()
    .single();

  if (error) {
    console.error('[bookings] insert failed', error);
    return NextResponse.json(
      { error: 'Could not save. Make sure the bookings migration has run.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ booking: data });
}
