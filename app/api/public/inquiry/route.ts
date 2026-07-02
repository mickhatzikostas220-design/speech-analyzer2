import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfileBySlug } from '@/lib/onesheet/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/public/inquiry  { slug, ...inquiry }
 * Public endpoint: an organizer submits a booking inquiry from a speaker's
 * one-sheet. Inserted (service role) into that speaker's Booking Inbox.
 */
export async function POST(req: NextRequest) {
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot — silently accept bot submissions without storing them.
  if (typeof b.website === 'string' && b.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  // Rate-limit by client IP. This is a public, unauthenticated write endpoint, so
  // cap submissions to keep a speaker's Booking Inbox from being flooded with spam
  // (a bot that skips the honeypot above). Best-effort per-instance in-memory cap.
  const rl = rateLimit(`inquiry:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests — please try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const str = (v: unknown, max = 2000) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

  const slug = str(b.slug, 64);
  if (!slug) return NextResponse.json({ error: 'Missing speaker.' }, { status: 400 });

  const contact_email = str(b.contact_email, 200);
  const organization = str(b.organization);
  const event_name = str(b.event_name);
  const message = str(b.message, 4000);

  if (!contact_email || !/.+@.+\..+/.test(contact_email)) {
    return NextResponse.json({ error: 'Add a valid email so they can reach you.' }, { status: 422 });
  }
  if (!organization && !event_name && !message) {
    return NextResponse.json({ error: 'Tell them a bit about your event.' }, { status: 422 });
  }

  const target = await getProfileBySlug(slug);
  if (!target) return NextResponse.json({ error: 'Speaker not found.' }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin.from('bookings').insert({
    user_id: target.userId,
    organization,
    contact_name: str(b.contact_name),
    contact_email,
    event_name,
    event_date: str(b.event_date, 20),
    location: str(b.location),
    notes: message,
    status: 'new',
    source: 'one_sheet',
  });

  if (error) {
    console.error('[public/inquiry] insert failed', error);
    return NextResponse.json({ error: 'Could not send. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
