import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawText = (await request.text()).trim();
    const { fileName } = rawText ? JSON.parse(rawText) : {};
    if (!fileName) return NextResponse.json({ error: 'fileName required' }, { status: 400 });

    const clipId = randomUUID();
    const ext = String(fileName).split('.').pop() || 'mp4';
    const path = `${user.id}/script/${params.id}/${clipId}.${ext}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from('speeches')
      .createSignedUploadUrl(path);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ signedUrl: data.signedUrl, path, clipId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
