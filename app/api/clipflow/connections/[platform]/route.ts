import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLATFORMS, type Platform } from '@/lib/clipflow/types';

export const dynamic = 'force-dynamic';

// Disconnect a platform (deletes the stored, encrypted credentials).
export async function DELETE(_: Request, { params }: { params: { platform: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!PLATFORMS.includes(params.platform as Platform)) {
      return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });
    }

    const { error } = await supabase
      .from('clipflow_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', params.platform);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
