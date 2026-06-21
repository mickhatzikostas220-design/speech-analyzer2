import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptToken } from '@/lib/clipflow/crypto';
import {
  resolvePostizCreds,
  getUserPostizCreds,
  makePostizCreds,
  listIntegrations,
  normalizeApiUrl,
  platformForProvider,
  PostizError,
} from '@/lib/clipflow/postiz';

// Manage a user's own Postiz credentials (bring-your-own workspace).
// The API key is validated against Postiz, stored encrypted, and never returned.
export const dynamic = 'force-dynamic';

function countChannels(integrations: { identifier: string; disabled: boolean }[]): number {
  return integrations.filter((i) => !i.disabled && platformForProvider(i.identifier)).length;
}

// GET — connection status (no secrets): is Postiz on, and from where.
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolved = await resolvePostizCreds(supabase, user.id);
    if (!resolved) {
      return NextResponse.json({ connected: false, source: null, api_url: null, channels: null });
    }

    let channels: number | null = null;
    try {
      channels = countChannels(await listIntegrations(resolved.creds));
    } catch {
      // Reachability is best-effort; the key may still be valid.
    }

    return NextResponse.json({
      connected: true,
      source: resolved.source, // 'user' | 'env'
      api_url: resolved.creds.apiUrl,
      manage_url: resolved.creds.appUrl,
      channels,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT — save/replace this user's Postiz key after validating it against Postiz.
export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = (await request.text()).trim();
    const body = raw ? JSON.parse(raw) : {};
    const apiKey: string = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiUrlInput: string | null =
      typeof body.apiUrl === 'string' && body.apiUrl.trim() ? body.apiUrl.trim() : null;

    if (!apiKey) {
      return NextResponse.json({ error: 'Enter your Postiz API key.' }, { status: 400 });
    }

    // Validate the key by listing the workspace's channels before storing it.
    const creds = makePostizCreds(apiKey, apiUrlInput);
    let channels: number;
    try {
      channels = countChannels(await listIntegrations(creds, true));
    } catch (err) {
      const detail = err instanceof PostizError ? err.message : 'Could not reach Postiz.';
      return NextResponse.json(
        { error: `That Postiz API key didn't work. ${detail}` },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('clipflow_postiz_accounts').upsert(
      {
        user_id: user.id,
        encrypted_api_key: encryptToken(apiKey),
        api_url: apiUrlInput ? normalizeApiUrl(apiUrlInput) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      connected: true,
      source: 'user',
      api_url: creds.apiUrl,
      manage_url: creds.appUrl,
      channels,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — remove this user's key (revert to the app default or OAuth path).
export async function DELETE() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only act if the user actually has a stored key (env default isn't deletable).
    const own = await getUserPostizCreds(supabase, user.id);
    if (own) {
      const { error } = await supabase
        .from('clipflow_postiz_accounts')
        .delete()
        .eq('user_id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
