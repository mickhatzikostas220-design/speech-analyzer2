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
      .from('timeline_projects')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Generate signed download URLs for every unique clip path (parallel)
    const admin = createAdminClient();
    const segments = (project.segments ?? []) as Array<{ clips: Array<{ clipPath: string }> }>;
    const uniquePaths = Array.from(
      new Set(segments.flatMap(seg => (seg.clips ?? []).map(c => c.clipPath).filter(Boolean)))
    );
    const signedEntries = await Promise.all(
      uniquePaths.map(async path => {
        const { data } = await admin.storage.from('speeches').createSignedUrl(path, 3600);
        return [path, data?.signedUrl ?? null] as [string, string | null];
      })
    );
    const pathToUrl = new Map(signedEntries.filter(([, url]) => url !== null) as [string, string][]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichedSegments = segments.map((seg: any) => ({
      ...seg,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clips: (seg.clips ?? []).map((clip: any) => ({
        ...clip,
        videoUrl: pathToUrl.get(clip.clipPath) ?? null,
      })),
    }));

    return NextResponse.json({ ...project, segments: enrichedSegments });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawText = (await request.text()).trim();
    const body = rawText ? JSON.parse(rawText) : {};
    const allowed = ['title', 'segments', 'captions', 'status'];
    const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

    const { error } = await supabase
      .from('timeline_projects')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await supabase
      .from('timeline_projects')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
