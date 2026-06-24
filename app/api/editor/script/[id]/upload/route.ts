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

    // Confirm the script project belongs to the caller (RLS-scoped) first.
    const { data: project } = await supabase
      .from('script_projects')
      .select('id')
      .eq('id', params.id)
      .single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const clipId = randomUUID();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const path = `${user.id}/script/${params.id}/${clipId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const admin = createAdminClient();
    const { error: uploadErr } = await admin.storage
      .from('speeches')
      .upload(path, buffer, { upsert: true, contentType: file.type || 'video/mp4' });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: signed } = await admin.storage
      .from('speeches')
      .createSignedUrl(path, 3600);

    return NextResponse.json({
      clipId,
      path,
      name: file.name,
      videoUrl: signed?.signedUrl ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
