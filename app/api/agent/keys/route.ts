import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getUserAndAdmin } from '@/lib/agent/server';
import { deleteApiKey, saveApiKey } from '@/lib/agent/store';
import { isProvider } from '@/lib/agent/models';
import { isEncryptionConfigured } from '@/lib/crypto';
import type { Provider } from '@/lib/agent/types';

export const runtime = 'nodejs';

// Lightweight auth check so we don't store an invalid key.
async function validateKey(provider: Provider, key: string): Promise<string | null> {
  try {
    if (provider === 'anthropic') {
      await new Anthropic({ apiKey: key }).models.list();
    } else {
      await new OpenAI({ apiKey: key }).models.list();
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes('401') || /api key|unauthor|invalid/i.test(msg)
      ? 'That API key was rejected by the provider.'
      : `Could not validate the key: ${msg}`;
  }
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
  const { provider, key } = body as { provider?: string; key?: string };
  if (!isProvider(provider)) return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  if (!key || typeof key !== 'string' || key.length < 8) {
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 400 });
  }

  const validationError = await validateKey(provider, key);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  await saveApiKey(auth.admin, auth.user.id, provider, key);
  return NextResponse.json({ ok: true, hint: key.slice(-4) });
}

export async function DELETE(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = new URL(request.url).searchParams.get('provider');
  if (!isProvider(provider)) return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });

  await deleteApiKey(auth.admin, auth.user.id, provider);
  return NextResponse.json({ ok: true });
}
