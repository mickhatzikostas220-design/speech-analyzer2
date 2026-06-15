import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getUserAndAdmin } from '@/lib/agent/server';
import { buildAuthUrl, googleConfigured } from '@/lib/agent/google';
import { isEncryptionConfigured } from '@/lib/crypto';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';

export async function GET() {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.redirect(`${APP_URL}/login`);

  if (!googleConfigured() || !isEncryptionConfigured()) {
    return NextResponse.redirect(`${APP_URL}/agent/settings?error=google_not_configured`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  const response = NextResponse.redirect(buildAuthUrl(state));
  response.cookies.set('agent_oauth_state', state, {
    httpOnly: true,
    secure: APP_URL.startsWith('https'),
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
