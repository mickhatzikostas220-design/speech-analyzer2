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
    // Only sign paths that live under this user's own storage prefix. video_path
    // is client-writable (see PATCH), and the admin client bypasses Storage RLS,
    // so without this check a user could have us sign another user's object.
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

    // Same guard as GET: only delete objects under this user's own prefix, since
    // video_path is client-writable and the admin client bypasses Storage RLS.
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
