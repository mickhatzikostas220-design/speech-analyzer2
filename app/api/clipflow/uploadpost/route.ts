import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  uploadPostEnabled,
  getUserConnection,
  generateConnectLink,
  deleteProfile,
} from '@/lib/clipflow/uploadpost';

// Manage a user's Upload-Post connection. The account API key is app-level (env);
// each user connects their own social channels via an Upload-Post hosted link.
export const dynamic = 'force-dynamic';

// GET — connection status for the panel (no secrets).
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!uploadPostEnabled()) {
      return NextResponse.json({ configured: false, connected: [], names: {} });
    }

    const { connected, names } = await getUserConnection(user.id, true);
    return NextResponse.json({ configured: true, connected, names });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — create the hosted link the user opens to connect their accounts.
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!uploadPostEnabled()) {
      return NextResponse.json(
        { error: 'Upload-Post is not configured for this app.' },
        { status: 400 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || request.nextUrl.origin;
    const url = await generateConnectLink(user.id, `${origin}/clipflow?connected=uploadpost`);
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — disconnect (removes the user's Upload-Post profile + its accounts).
export async function DELETE() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (uploadPostEnabled()) await deleteProfile(user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
