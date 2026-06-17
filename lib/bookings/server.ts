import type { SupabaseClient } from '@supabase/supabase-js';
import type { Booking } from './types';

export interface BookingsState {
  bookings: Booking[];
  newCount: number;
}

/**
 * Load a speaker's bookings. Defensive — returns an empty set if the
 * bookings table hasn't been migrated yet.
 */
export async function getBookings(
  supabase: SupabaseClient,
  userId: string
): Promise<BookingsState> {
  try {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    const bookings = (data as Booking[]) ?? [];
    return { bookings, newCount: bookings.filter((b) => b.status === 'new').length };
  } catch {
    return { bookings: [], newCount: 0 };
  }
}
