import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { isEncryptionConfigured } from '@/lib/crypto';
import { deleteComposioKey, saveComposioKey } from '@/lib/composio/store';
import { validateApiKey } from '@/lib/composio/client';

export const runtime = 'nodejs';

// Save the user's Composio API key (bring-your-own-key). Validated against
// Composio before storing, then encrypted at rest.
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
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (key.length < 8) {
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 400 });
  }

  const validationError = await validateApiKey(key);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  await saveComposioKey(auth.admin, auth.user.id, key);
  return NextResponse.json({ ok: true, hint: key.slice(-4) });
}

export async function DELETE() {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await deleteComposioKey(auth.admin, auth.user.id);
  return NextResponse.json({ ok: true });
}
