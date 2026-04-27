import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: analysis } = await supabase
    .from('analyses')
    .select('file_path')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.storage.from('speeches').remove([analysis.file_path]);

  const { error } = await supabase
    .from('analyses')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [analysisRes, feedbackRes, timelineRes] = await Promise.all([
    supabase
      .from('analyses')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('feedback_points')
      .select('*')
      .eq('analysis_id', params.id)
      .order('timecode_ms'),
    supabase
      .from('engagement_timeline')
      .select('*')
      .eq('analysis_id', params.id)
      .order('timecode_ms'),
  ]);

  if (!analysisRes.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let fileUrl: string | null = null;
  if (analysisRes.data.file_path) {
    const { data: signed } = await supabase.storage
      .from('speeches')
      .createSignedUrl(analysisRes.data.file_path, 3600);
    fileUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    analysis:           analysisRes.data,
    feedback_points:    feedbackRes.data ?? [],
    engagement_timeline: timelineRes.data ?? [],
    roi_timeline:       analysisRes.data.roi_timeline ?? [],
    file_url:           fileUrl,
  });
}
