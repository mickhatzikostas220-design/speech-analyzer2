// Resend a verification code for a pending signup. We don't have the password
// here, so we mint a fresh one-time code via a magiclink-type admin link (which
// also confirms the email on verify) and deliver it through Resend.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendVerificationCode } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: NextRequest) {
  const limit = rateLimit(`resend:${clientIp(request)}`, 4, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes before trying again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // Also cap per-target-email: the client IP comes from an X-Forwarded-For header
  // that a caller can rotate, so an IP-only limit is bypassable. Rate-limiting on
  // the destination address stops someone mail-bombing one inbox regardless of IP.
  const emailLimit = rateLimit(`resend-email:${email}`, 4, 10 * 60 * 1000);
  if (!emailLimit.ok) {
    return NextResponse.json(
      { error: 'Too many requests for this email. Please wait a few minutes before trying again.' },
      { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfter) } }
    );
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email delivery is not configured yet. Please contact support.' },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });

  // Don't reveal whether the address exists — respond the same either way.
  if (error || !data.properties?.email_otp) {
    if (error) console.error('Resend generateLink failed:', error.message);
    return NextResponse.json({ success: true });
  }

  try {
    await sendVerificationCode(email, data.properties.email_otp);
  } catch (err) {
    console.error('Resend email failed:', err);
  }

  return NextResponse.json({ success: true });
}
