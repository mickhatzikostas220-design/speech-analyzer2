import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { getSettings, listConnections, listKeyHints, saveSettings } from '@/lib/agent/store';
import { MODEL_OPTIONS, PROVIDER_LABEL, isProvider } from '@/lib/agent/models';
import { isEncryptionConfigured } from '@/lib/crypto';
import { googleConfigured } from '@/lib/agent/google';
import { getComposioKeyHint, listComposioConnections } from '@/lib/composio/store';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [settings, keyHints, connections, composioKeyHint, composioConnections] =
    await Promise.all([
      getSettings(auth.admin, auth.user.id),
      listKeyHints(auth.admin, auth.user.id),
      listConnections(auth.admin, auth.user.id),
      getComposioKeyHint(auth.admin, auth.user.id),
      listComposioConnections(auth.admin, auth.user.id),
    ]);

  return NextResponse.json({
    settings,
    keyHints,
    connections,
    modelOptions: MODEL_OPTIONS,
    providerLabels: PROVIDER_LABEL,
    encryptionConfigured: isEncryptionConfigured(),
    googleConfigured: googleConfigured(),
    composio: {
      keyHint: composioKeyHint,
      connections: composioConnections.map((c) => ({
        id: c.id,
        toolkit: c.toolkit,
        account_label: c.account_label,
        autonomy: c.autonomy,
      })),
    },
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const patch: { provider?: 'anthropic' | 'openai'; model?: string; system_prompt?: string | null } = {};

  if (body.provider !== undefined) {
    if (!isProvider(body.provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
    patch.provider = body.provider;
  }
  if (typeof body.model === 'string' && body.model.trim()) patch.model = body.model.trim();
  if (body.system_prompt !== undefined) {
    patch.system_prompt = body.system_prompt ? String(body.system_prompt).slice(0, 4000) : null;
  }

  await saveSettings(auth.admin, auth.user.id, patch);
  return NextResponse.json({ ok: true });
}
