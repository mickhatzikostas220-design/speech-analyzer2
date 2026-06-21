import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfileConnection, validateApiKey, ensureProfile, UploadPostError } from '@/lib/clipflow/uploadpost';
import {
  getStoredCreds,
  resolveCreds,
  saveStoredKey,
  deleteStoredKey,
  sharedKeyConfigured,
} from '@/lib/clipflow/uploadpost-store';

// Manage a user's Upload-Post connection.
//
// Each user brings their OWN Upload-Post API key (https://app.upload-post.com/api-keys)
// so clips post to THEIR OWN connected accounts. A shared app-level key, if set,
// is used only as a fallback. The key is encrypted at rest and never returned to
// the browser — only a last-4 hint is exposed.
export const dynamic = 'force-dynamic';

// Default profile name created when the user's account has none yet.
const DEFAULT_PROFILE = 'clipflow';

// GET — connection status for the panel (no secrets, only a last-4 hint).
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stored = await getStoredCreds(supabase, user.id);
    const creds = await resolveCreds(supabase, user.id);

    if (!creds) {
      return NextResponse.json({
        configured: false,
        hasOwnKey: false,
        sharedKey: sharedKeyConfigured(),
        keyHint: null,
        profile: null,
        connected: [],
        names: {},
      });
    }

    let connected: string[] = [];
    let names: Record<string, string> = {};
    try {
      const conn = await getProfileConnection(creds.apiKey, creds.profile, true);
      connected = conn.connected;
      names = conn.names as Record<string, string>;
    } catch {
      // Leave as not-connected if Upload-Post is unreachable.
    }

    return NextResponse.json({
      configured: true,
      hasOwnKey: Boolean(stored),
      sharedKey: sharedKeyConfigured(),
      keyHint: stored?.hint ?? null,
      profile: creds.profile,
      connected,
      names,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — save the user's own Upload-Post API key (validated against the API).
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (apiKey.length < 8) {
      return NextResponse.json(
        { error: 'Enter your Upload-Post API key (app.upload-post.com/api-keys).' },
        { status: 400 }
      );
    }

    // Validate the key and discover existing profiles in one call.
    let profiles;
    try {
      profiles = await validateApiKey(apiKey);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const rejected = /\b(401|403)\b/.test(raw) || /unauthor|invalid|forbidden/i.test(raw);
      return NextResponse.json(
        { error: rejected ? 'That API key was rejected by Upload-Post.' : `Could not verify the key: ${raw}` },
        { status: 400 }
      );
    }

    // Post under an existing profile when the account already has one (so accounts
    // already linked in their Upload-Post dashboard work immediately); otherwise
    // create a managed profile they can connect accounts to.
    let profile = profiles[0]?.username;
    if (!profile) {
      profile = DEFAULT_PROFILE;
      await ensureProfile(apiKey, profile);
    }

    await saveStoredKey(supabase, user.id, apiKey, profile);

    return NextResponse.json({
      ok: true,
      hasOwnKey: true,
      keyHint: apiKey.slice(-4),
      profile,
      connected: profiles[0]?.connected ?? [],
    });
  } catch (err) {
    const msg = err instanceof UploadPostError ? err.message : err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — remove the user's own key (non-destructive to their Upload-Post account).
export async function DELETE() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await deleteStoredKey(supabase, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
