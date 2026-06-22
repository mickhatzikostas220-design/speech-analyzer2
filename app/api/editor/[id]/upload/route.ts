import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Cap in-memory buffering and constrain to known a/v types. The stored
    // content type is derived from the (allow-listed) extension, never from the
    // attacker-controlled file.type.
    const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File too large (max 200 MB).' }, { status: 413 });
    }
    const CONTENT_TYPES: Record<string, string> = {
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
      mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg',
    };
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    if (!CONTENT_TYPES[ext]) {
      return NextResponse.json({ error: 'Unsupported file type.' }, { status: 415 });
    }
    const path = `${user.id}/editor/${params.id}/original.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const admin = createAdminClient();
    const { error: uploadErr } = await admin.storage
      .from('speeches')
      .upload(path, buffer, { upsert: true, contentType: CONTENT_TYPES[ext] });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: signed } = await admin.storage
      .from('speeches')
      .createSignedUrl(path, 3600);

    return NextResponse.json({
      path,
      name: file.name,
      videoUrl: signed?.signedUrl ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
