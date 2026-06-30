import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendAccessRequestNotification } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  // Unauthenticated endpoint that writes a row AND emails the admin — throttle
  // it so it can't be used to flood the DB / admin inbox.
  const limit = rateLimit(`request-access:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: { name?: string; email?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { name, email, reason } = body;

  if (!name?.trim() || !email?.trim() || !reason?.trim()) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: existing } = await adminSupabase
    .from('access_requests')
    .select('status')
    .eq('email', email.toLowerCase().trim())
    .in('status', ['pending', 'approved'])
    .maybeSingle();

  if (existing?.status === 'approved') {
    return NextResponse.json({ error: 'This email has already been approved. Check your inbox for an invite link.' }, { status: 409 });
  }
  if (existing?.status === 'pending') {
    return NextResponse.json({ error: 'A request from this email is already pending review.' }, { status: 409 });
  }

  const { data: inserted, error } = await adminSupabase
    .from('access_requests')
    .insert({ name: name.trim(), email: email.toLowerCase().trim(), reason: reason.trim() })
    .select('id')
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  if (process.env.RESEND_API_KEY) {
    try {
      await sendAccessRequestNotification(inserted.id, name.trim(), email.toLowerCase().trim(), reason.trim());
    } catch (emailErr) {
      console.error('Admin notification email failed:', emailErr);
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
