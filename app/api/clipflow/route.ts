import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseSourceUrl, YouTubeError } from '@/lib/clipflow/youtube';
import { enqueue } from '@/lib/clipflow/queue';
import { CLIP_LENGTHS, type ClipLength, type ClipPreferences } from '@/lib/clipflow/types';

export const dynamic = 'force-dynamic';

// Coerce arbitrary request input into a safe ClipPreferences object. Returns
// null when the user supplied nothing meaningful, so we store a clean NULL.
function sanitizePreferences(input: unknown): ClipPreferences | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const prefs: ClipPreferences = {};

  if (typeof raw.length === 'string' && CLIP_LENGTHS.includes(raw.length as ClipLength)) {
    if (raw.length !== 'any') prefs.length = raw.length as ClipLength;
  }
  if (typeof raw.tone === 'string' && raw.tone.trim()) {
    prefs.tone = raw.tone.trim().slice(0, 200);
  }
  if (typeof raw.notes === 'string' && raw.notes.trim()) {
    prefs.notes = raw.notes.trim().slice(0, 600);
  }

  return Object.keys(prefs).length > 0 ? prefs : null;
}

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
    const body = raw ? JSON.parse(raw) : {};
    const { url } = body;
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Paste a YouTube video or channel URL.' }, { status: 400 });
    }
    const preferences = sanitizePreferences(body.preferences);

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
        preferences,
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
