import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: project, error } = await supabase
      .from('editor_projects')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let video_url: string | null = null;
    // Defence in depth: only ever sign a path inside the caller's own folder,
    // even though PATCH already refuses to store anything else.
    if (project.video_path && String(project.video_path).startsWith(`${user.id}/`)) {
      const admin = createAdminClient();
      const { data } = await admin.storage
        .from('speeches')
        .createSignedUrl(project.video_path, 3600);
      video_url = data?.signedUrl ?? null;
    }

    return NextResponse.json({ ...project, video_url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawText = (await request.text()).trim();
    const body = rawText ? JSON.parse(rawText) : {};
    const allowed = ['video_path', 'video_name', 'video_duration', 'clips', 'status'];
    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k))
    );

    // SECURITY: video_path is later handed to the service-role storage client
    // (createSignedUrl / remove in GET and DELETE), which bypasses Storage RLS.
    // Owning this project row does NOT entitle the caller to point it at another
    // user's object, so a client may only ever set a path inside its own folder.
    // Legitimate uploads always produce `${user.id}/editor/...` (see the upload
    // and signed-upload routes), so this rejects forged cross-tenant paths
    // without affecting the normal flow.
    if ('video_path' in updates) {
      const vp = updates.video_path;
      if (typeof vp !== 'string' || !vp.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: 'Invalid video_path' }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from('editor_projects')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: project } = await supabase
      .from('editor_projects')
      .select('video_path')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    // Defence in depth: never let a delete reach outside the caller's folder.
    if (project?.video_path && String(project.video_path).startsWith(`${user.id}/`)) {
      const admin = createAdminClient();
      await admin.storage.from('speeches').remove([project.video_path]);
    }

    await supabase
      .from('editor_projects')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
