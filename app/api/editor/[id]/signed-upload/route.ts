import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Whitelist the file extension so it can't inject path separators / `..` into
// the storage object key.
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

    const rawText = (await request.text()).trim();
    const { fileName } = rawText ? JSON.parse(rawText) : {};
    if (!fileName) return NextResponse.json({ error: 'fileName required' }, { status: 400 });

    // Verify project ownership before minting a service-role signed upload URL
    // (the admin client bypasses RLS).
    const { data: project } = await supabase
      .from('editor_projects')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ext = safeExt(String(fileName));
    const path = `${user.id}/editor/${params.id}/original.${ext}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from('speeches')
      .createSignedUploadUrl(path);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ signedUrl: data.signedUrl, path });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
