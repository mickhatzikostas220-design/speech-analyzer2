import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseSourceUrl, YouTubeError } from '@/lib/clipflow/youtube';
import { enqueue } from '@/lib/clipflow/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('clipflow_projects')
      .select('id, source_url, source_type, title, channel_title, thumbnail_url, duration_seconds, status, progress, error, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = (await request.text()).trim();
    const { url } = raw ? JSON.parse(raw) : {};
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Paste a YouTube video or channel URL.' }, { status: 400 });
    }

    // Validate the URL up front so the user gets immediate feedback.
    let parsed;
    try {
      parsed = parseSourceUrl(url);
    } catch (err) {
      const msg = err instanceof YouTubeError ? err.message : 'Invalid URL';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { data: project, error } = await supabase
      .from('clipflow_projects')
      .insert({
        user_id: user.id,
        source_url: url.trim(),
        source_type: parsed.type,
        youtube_id: parsed.videoId ?? null,
        status: 'queued',
        progress: 0,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enqueue background processing (also triggerable immediately via /process).
    const admin = createAdminClient();
    await enqueue(admin, {
      user_id: user.id,
      type: 'process_project',
      project_id: project.id,
      payload: { projectId: project.id },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
