import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { isEncryptionConfigured } from '@/lib/crypto';
import { validateUploadPostKey } from '@/lib/clipflow/uploadpost';
import { PLATFORMS, type Platform } from '@/lib/clipflow/types';
import {
  deleteSecret,
  isClipflowSecretKind,
  listSecretHints,
  saveOAuthSecret,
  saveSimpleSecret,
} from '@/lib/clipflow/secrets';

// Per-user ClipFlow API keys (BYOK): OpenAI, Upload-Post, and per-platform OAuth
// client credentials. Keys are validated where possible, encrypted at rest, and
// never returned to the browser — only a 4-char hint is exposed.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hints = await listSecretHints(supabase, user.id);
  return NextResponse.json({
    hints,
    encryptionConfigured: isEncryptionConfigured(),
  });
}

async function validateOpenAIKey(key: string): Promise<string | null> {
  try {
    await new OpenAI({ apiKey: key }).models.list();
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes('401') || /api key|unauthor|invalid/i.test(msg)
      ? 'That OpenAI API key was rejected.'
      : `Could not validate the key: ${msg}`;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: 'Server is missing APP_ENCRYPTION_KEY — keys cannot be stored securely.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const kind = body.kind;
  if (!isClipflowSecretKind(kind)) {
    return NextResponse.json({ error: 'Invalid key kind' }, { status: 400 });
  }

  // Per-platform OAuth: expects clientId + clientSecret.
  if (kind.startsWith('oauth_')) {
    const platform = kind.slice('oauth_'.length) as Platform;
    if (!PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Both client id and client secret are required.' }, { status: 400 });
    }
    await saveOAuthSecret(supabase, user.id, platform, { clientId, clientSecret });
    return NextResponse.json({ ok: true, hint: clientId.slice(-4) });
  }

  // Simple keys: openai | upload_post.
  if (kind !== 'openai' && kind !== 'upload_post') {
    return NextResponse.json({ error: 'Invalid key kind' }, { status: 400 });
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key || key.length < 8) {
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 400 });
  }

  const validationError =
    kind === 'openai'
      ? await validateOpenAIKey(key)
      : kind === 'upload_post'
      ? await validateUploadPostKey(key)
      : null;
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  await saveSimpleSecret(supabase, user.id, kind, key);
  return NextResponse.json({ ok: true, hint: key.slice(-4) });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const kind = new URL(request.url).searchParams.get('kind');
  if (!isClipflowSecretKind(kind)) {
    return NextResponse.json({ error: 'Invalid key kind' }, { status: 400 });
  }
  await deleteSecret(supabase, user.id, kind);
  return NextResponse.json({ ok: true });
}
