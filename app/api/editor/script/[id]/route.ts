import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface ScriptClip {
  id: string;
  name: string;
  path: string;
  duration: number | null;
  transcribed: boolean;
  transcription: unknown[];
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: project, error } = await supabase
      .from('script_projects')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const admin = createAdminClient();
    // Only sign paths inside the caller's own storage prefix — clip paths come
    // from client-editable JSON, so an arbitrary path here would otherwise let
    // a user read another user's files via a signed URL (cross-tenant read).
    const clips: ScriptClip[] = await Promise.all(
      (project.clips as ScriptClip[]).map(async (clip) => {
        if (!clip.path || !clip.path.startsWith(`${user.id}/`)) return clip;
        const { data } = await admin.storage
          .from('speeches')
          .createSignedUrl(clip.path, 3600);
        return { ...clip, videoUrl: data?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ ...project, clips });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawText = (await request.text()).trim();
    const body = rawText ? JSON.parse(rawText) : {};
    const allowed = ['title', 'script', 'clips', 'segments', 'status'];
    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k))
    );

    const { error } = await supabase
      .from('script_projects')
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: project } = await supabase
      .from('script_projects')
      .select('clips')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (project?.clips && Array.isArray(project.clips) && project.clips.length > 0) {
      const admin = createAdminClient();
      const paths = (project.clips as ScriptClip[])
        .map((c) => c.path)
        // Never delete outside the caller's own prefix — paths are client-set.
        .filter((p) => p && p.startsWith(`${user.id}/`));
      if (paths.length > 0) {
        await admin.storage.from('speeches').remove(paths);
      }
    }

    await supabase
      .from('script_projects')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
