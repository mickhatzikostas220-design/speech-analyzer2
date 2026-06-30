import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_EXT = new Set(['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mp3', 'wav', 'm4a', 'aac']);
function safeExt(fileName: string): string {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_EXT.has(ext) ? ext : 'mp4';
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify project ownership before writing with the service-role client.
    const { data: project } = await supabase
      .from('script_projects')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const clipId = randomUUID();
    const ext = safeExt(file.name);
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
