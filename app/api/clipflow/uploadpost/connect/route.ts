import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateConnectLink } from '@/lib/clipflow/uploadpost';
import { resolveCreds } from '@/lib/clipflow/uploadpost-store';

// Create the Upload-Post hosted link the user opens to connect (or manage) their
// TikTok / Instagram / YouTube / X accounts. Uses the user's own API key when set,
// otherwise the shared app-level key.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const creds = await resolveCreds(supabase, user.id);
    if (!creds) {
      return NextResponse.json(
        { error: 'Add your Upload-Post API key first.' },
        { status: 400 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || request.nextUrl.origin;
    const url = await generateConnectLink(
      creds.apiKey,
      creds.profile,
      `${origin}/clipflow?connected=uploadpost`
    );
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
