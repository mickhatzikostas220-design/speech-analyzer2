// Password reset, step 1: mint a 6-digit recovery code for the account (if it
// exists) and deliver it via Resend — same pattern as signup/resend, because
// Supabase's built-in emails are rate-limited and unreliable in production.
// Always responds with success so the endpoint can't be used to check whether
// an email has an account.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPasswordResetCode } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: NextRequest) {
  const limit = rateLimit(`forgot:${clientIp(request)}`, 4, 10 * 60 * 1000);
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
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email delivery is not configured yet. Please contact support.' },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });

  // Don't reveal whether the address exists — respond the same either way.
  if (error || !data.properties?.email_otp) {
    if (error) console.error('Password reset generateLink failed:', error.message);
    return NextResponse.json({ success: true });
  }

  try {
    await sendPasswordResetCode(email, data.properties.email_otp);
  } catch (err) {
    console.error('Password reset email failed:', err);
  }

  return NextResponse.json({ success: true });
}
