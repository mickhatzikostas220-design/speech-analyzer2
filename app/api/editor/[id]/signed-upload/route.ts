import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawText = (await request.text()).trim();
    const { fileName } = rawText ? JSON.parse(rawText) : {};
    if (!fileName) return NextResponse.json({ error: 'fileName required' }, { status: 400 });

    // Both params.id and the extension end up in the storage key — constrain
    // them so crafted values can't introduce path separators or traversal.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.id)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    // Confirm the project belongs to the caller before minting a signed upload
    // URL (defense-in-depth; the key is already namespaced to user.id).
    const { data: project } = await supabase
      .from('editor_projects')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const ext =
      (String(fileName).split('.').pop() ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 10) || 'mp4';
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
