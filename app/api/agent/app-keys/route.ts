import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { saveAppKey, deleteAppKey, listAppKeyHints } from '@/lib/agent/store';
import { isEncryptionConfigured } from '@/lib/crypto';

export const runtime = 'nodejs';

// Allowed app IDs — extend this list as new integrations are added.
const VALID_APP_IDS = new Set([
  'twitter',
  'instagram',
  'youtube',
  'linkedin',
  'facebook',
  'tiktok',
  'notion',
  'slack',
  'dropbox',
  'airtable',
  'hubspot',
]);

export async function GET() {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hints = await listAppKeyHints(auth.admin, auth.user.id);
  return NextResponse.json({ hints });
}

export async function POST(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: 'Server is missing APP_ENCRYPTION_KEY — keys cannot be stored securely.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { appId, key } = body as { appId?: string; key?: string };

  if (!appId || !VALID_APP_IDS.has(appId)) {
    return NextResponse.json({ error: 'Invalid app ID.' }, { status: 400 });
  }
  if (!key || typeof key !== 'string' || key.trim().length < 4) {
    return NextResponse.json({ error: 'Key is too short.' }, { status: 400 });
  }

  await saveAppKey(auth.admin, auth.user.id, appId, key.trim());
  return NextResponse.json({ ok: true, hint: key.trim().slice(-4) });
}

export async function DELETE(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appId = new URL(request.url).searchParams.get('appId');
  if (!appId || !VALID_APP_IDS.has(appId)) {
    return NextResponse.json({ error: 'Invalid app ID.' }, { status: 400 });
  }

  await deleteAppKey(auth.admin, auth.user.id, appId);
  return NextResponse.json({ ok: true });
}
