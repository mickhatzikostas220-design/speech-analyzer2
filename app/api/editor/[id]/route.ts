import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Storage paths live under `<userId>/…`. Anything else must never be handed to
// the service-role storage client, which bypasses per-user storage policies.
function ownsStoragePath(path: unknown, userId: string): boolean {
  return typeof path === 'string' && path.startsWith(`${userId}/`);
}

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
    // Defence in depth: the admin (service-role) client bypasses storage RLS, so
    // only ever hand it a path inside the caller's own prefix. A path that was
    // somehow set to another user's namespace is treated as absent.
    if (project.video_path && ownsStoragePath(project.video_path, user.id)) {
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

    // A user may only point a project at a file inside their own storage prefix.
    // Without this, the GET/DELETE handlers (which use the RLS-bypassing admin
    // client) could be steered at another user's video.
    if ('video_path' in updates && !ownsStoragePath(updates.video_path, user.id)) {
      return NextResponse.json({ error: 'Invalid video_path' }, { status: 400 });
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

    if (project?.video_path && ownsStoragePath(project.video_path, user.id)) {
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
