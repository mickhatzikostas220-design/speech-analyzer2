import { redirect } from 'next/navigation';
import { getUserBrandState } from '@/lib/brand/server';
import { createClient } from '@/lib/supabase/server';
import { getBookings } from '@/lib/bookings/server';
import { BookingInbox } from '@/components/bookings/BookingInbox';

export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const { userId } = await getUserBrandState();
  if (!userId) redirect('/login');

  const supabase = createClient();
  const { bookings } = await getBookings(supabase, userId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="eyebrow mb-2">Booking Inbox</p>
      <h1 className="display-h1 mb-1" style={{ fontSize: 'var(--text-h2)' }}>Your inquiries</h1>
      <p className="mb-8 text-muted">
        Track every speaking request — from first hello to a confirmed gig on your calendar.
      </p>
      <BookingInbox initialBookings={bookings} />
    </div>
  );
}
