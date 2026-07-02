import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendAccessRequestNotification } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: NextRequest) {
  // Public endpoint that writes a row and emails the admin — cap attempts the
  // same way signup/resend do to curb spam.
  const limit = rateLimit(`request-access:${clientIp(request)}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: { name?: unknown; email?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.slice(0, 120) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 2000) : '';

  if (!name || !email || !reason) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: existing } = await adminSupabase
    .from('access_requests')
    .select('status')
    .eq('email', email)
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
    .insert({ name, email, reason })
    .select('id')
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  if (process.env.RESEND_API_KEY) {
    try {
      await sendAccessRequestNotification(inserted.id, name, email, reason);
    } catch (emailErr) {
      console.error('Admin notification email failed:', emailErr);
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
