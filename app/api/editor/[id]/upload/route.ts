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

    // Both params.id and the extension end up in the storage key — constrain
    // them so crafted values can't introduce path separators or traversal.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.id)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    // Confirm the project belongs to the caller before touching storage. The key
    // is already namespaced to user.id, so this is defense-in-depth, but it keeps
    // uploads from landing under an id the user doesn't own.
    const { data: project } = await supabase
      .from('editor_projects')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const ext =
      (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) ||
      'mp4';
    const path = `${user.id}/editor/${params.id}/original.${ext}`;

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
      path,
      name: file.name,
      videoUrl: signed?.signedUrl ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
