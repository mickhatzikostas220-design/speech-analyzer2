import type { SupabaseClient } from '@supabase/supabase-js';
import type { Gig } from './types';
import { fetchIcsEvents } from './ics';

export interface UpcomingGigs {
  gigs: Gig[];
  calendarUrl: string | null;
  /** True when a calendar is connected but returned no upcoming events. */
  calendarEmpty: boolean;
}

/**
 * Upcoming gigs for the hub: manually-added gigs merged with events from a
 * connected calendar feed, future-dated and sorted. Defensive — if the
 * gigs table / calendar column aren't migrated yet, returns an empty set.
 */
export async function getUpcomingGigs(
  supabase: SupabaseClient,
  userId: string
): Promise<UpcomingGigs> {
  const nowIso = new Date().toISOString();

  let manual: Gig[] = [];
  try {
    const { data } = await supabase
      .from('gigs')
      .select('*')
      .eq('user_id', userId)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(12);
    manual = (data as Gig[]) ?? [];
  } catch {
    manual = [];
  }

  let calendarUrl: string | null = null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('calendar_ics_url')
      .eq('id', userId)
      .maybeSingle();
    calendarUrl = (data?.calendar_ics_url as string) ?? null;
  } catch {
    calendarUrl = null;
  }

  let calendarGigs: Gig[] = [];
  if (calendarUrl) {
    const events = await fetchIcsEvents(calendarUrl);
    calendarGigs = events
      .filter((e) => e.startsAt >= nowIso)
      .map((e, i) => ({
        id: `cal-${i}`,
        user_id: userId,
        title: e.title,
        location: e.location ?? null,
        kind: null,
        status: 'confirmed' as const,
        starts_at: e.startsAt,
        source: 'calendar' as const,
        created_at: '',
      }));
  }

  const gigs = [...manual, ...calendarGigs]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 6);

  return { gigs, calendarUrl, calendarEmpty: Boolean(calendarUrl) && calendarGigs.length === 0 };
}
