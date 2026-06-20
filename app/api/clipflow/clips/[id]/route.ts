import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateClipCopy } from '@/lib/clipflow/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EDITABLE = ['title', 'caption', 'description', 'hashtags', 'caption_style', 'position'];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = (await request.text()).trim();
    const body = raw ? JSON.parse(raw) : {};

    // Optional: regenerate AI copy from the clip's transcript.
    if (body.regenerate) {
      const { data: clip } = await supabase
        .from('clipflow_clips')
        .select('id, transcript_text, project_id')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .single();
      if (!clip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const { data: project } = await supabase
        .from('clipflow_projects')
        .select('title')
        .eq('id', clip.project_id)
        .single();

      const copy = await generateClipCopy({
        videoTitle: project?.title ?? '',
        transcriptText: clip.transcript_text ?? '',
      });

      const { error } = await supabase
        .from('clipflow_clips')
        .update({ ...copy, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(copy);
    }

    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => EDITABLE.includes(k))
    );
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('clipflow_clips')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
