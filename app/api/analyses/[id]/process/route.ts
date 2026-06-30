import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Each call dispatches a GPU job — throttle so processing can't be triggered
  // in a tight loop.
  const limit = rateLimit(`analysis-process:${user.id}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many processing requests. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  const { data: analysis } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (analysis.status === 'complete') {
    return NextResponse.json({ error: 'Analysis already complete' }, { status: 409 });
  }

  // Clear stale results when retrying
  if (analysis.status === 'error' || analysis.status === 'processing') {
    await Promise.all([
      supabase.from('engagement_timeline').delete().eq('analysis_id', params.id),
      supabase.from('feedback_points').delete().eq('analysis_id', params.id),
    ]);
  }

  await supabase
    .from('analyses')
    .update({ status: 'processing', error_message: null })
    .eq('id', params.id);

  try {
    const serverUrl = process.env.TRIBE_SERVER_URL;
    if (!serverUrl) throw new Error('TRIBE_SERVER_URL is not set');

    const { data: signedData } = await supabase.storage
      .from('speeches')
      .createSignedUrl(analysis.file_path, 3600);
    const signedUrl = signedData?.signedUrl ?? '';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.TRIBE_SERVER_SECRET) {
      headers['Authorization'] = `Bearer ${process.env.TRIBE_SERVER_SECRET}`;
    }

    // Fire-and-forget: Modal returns immediately, GPU work continues async
    await fetch(serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        analysis_id:      params.id,
        file_url:         signedUrl,
        duration_seconds: analysis.duration_seconds ?? 60,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    return NextResponse.json({ status: 'queued' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('analyses')
      .update({ status: 'error', error_message: msg })
      .eq('id', params.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
