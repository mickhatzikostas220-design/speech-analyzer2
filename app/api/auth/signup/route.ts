// Server-side signup: create the (unconfirmed) account and deliver a 6-digit
// verification code via Resend. We generate the code with the Supabase admin
// API instead of calling auth.signUp() on the client, because Supabase's
// built-in confirmation email is rate-limited and unreliable in production.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendVerificationCode } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: NextRequest) {
  // Cap signup attempts to curb account-spam and verification-email abuse.
  const limit = rateLimit(`signup:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Use at least 8 characters for your password.' }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email delivery is not configured yet. Please contact support.' },
      { status: 503 }
    );
  }

  const admin = createAdminClient();

  // generateLink creates the unconfirmed user and returns a one-time code
  // WITHOUT sending Supabase's own email.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
  });

  if (error) {
    const alreadyExists = /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      {
        error: alreadyExists
          ? 'An account with this email already exists. Try signing in instead.'
          : error.message,
      },
      { status: alreadyExists ? 409 : 400 }
    );
  }

  const code = data.properties?.email_otp;
  if (!code) {
    return NextResponse.json(
      { error: 'Could not generate a verification code. Please try again.' },
      { status: 500 }
    );
  }

  try {
    await sendVerificationCode(email, code);
  } catch (err) {
    console.error('Verification email send failed:', err);
    return NextResponse.json(
      { error: 'We could not send your verification email. Please try again shortly.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
