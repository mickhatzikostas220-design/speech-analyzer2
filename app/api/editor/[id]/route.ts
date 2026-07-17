import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isOwnedStoragePath } from '@/lib/storage/ownership';

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
    // Only sign a path that belongs to the caller. `video_path` is user-editable
    // via PATCH, so without this guard a user could point it at another user's
    // storage key and get back a working signed URL (the admin client bypasses
    // storage RLS).
    if (isOwnedStoragePath(project.video_path, user.id)) {
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

    // Guard against deleting another user's file: only remove a key under the
    // caller's own `${user.id}/` prefix (video_path is user-editable via PATCH).
    if (isOwnedStoragePath(project?.video_path, user.id)) {
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
