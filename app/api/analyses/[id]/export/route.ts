import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const format = request.nextUrl.searchParams.get('format') ?? 'json';

  const [analysisRes, feedbackRes] = await Promise.all([
    supabase
      .from('analyses')
      .select('title, transcript, overall_score, duration_seconds, created_at')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('feedback_points')
      .select('timecode_ms, timecode_end_ms, engagement_score, severity, feedback_text, improvement_suggestion')
      .eq('analysis_id', params.id)
      .order('timecode_ms'),
  ]);

  if (!analysisRes.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const analysis = analysisRes.data;
  const feedback = feedbackRes.data ?? [];

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  if (format === 'transcript') {
    const text = [
      `${analysis.title}`,
      `Analyzed: ${new Date(analysis.created_at).toLocaleDateString()}`,
      `Score: ${analysis.overall_score ?? 'N/A'}/100`,
      '',
      '--- TRANSCRIPT ---',
      '',
      analysis.transcript ?? 'No transcript available.',
    ].join('\n');

    return new NextResponse(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${analysis.title.replace(/[^a-z0-9]/gi, '_')}_transcript.txt"`,
      },
    });
  }

  if (format === 'feedback') {
    const rows = [
      ['Start', 'End', 'Score', 'Severity', 'Feedback', 'Suggestion'],
      ...feedback.map((fp) => [
        formatTime(fp.timecode_ms),
        formatTime(fp.timecode_end_ms),
        String(fp.engagement_score),
        fp.severity,
        `"${fp.feedback_text.replace(/"/g, '""')}"`,
        `"${fp.improvement_suggestion.replace(/"/g, '""')}"`,
      ]),
    ];

    const csv = rows.map((r) => r.join(',')).join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${analysis.title.replace(/[^a-z0-9]/gi, '_')}_feedback.csv"`,
      },
    });
  }

  // Default: full JSON
  return NextResponse.json({
    title: analysis.title,
    analyzed_at: analysis.created_at,
    overall_score: analysis.overall_score,
    duration_seconds: analysis.duration_seconds,
    transcript: analysis.transcript,
    feedback_points: feedback.map((fp) => ({
      start: formatTime(fp.timecode_ms),
      end: formatTime(fp.timecode_end_ms),
      start_ms: fp.timecode_ms,
      end_ms: fp.timecode_end_ms,
      engagement_score: fp.engagement_score,
      severity: fp.severity,
      feedback: fp.feedback_text,
      suggestion: fp.improvement_suggestion,
    })),
  });
}
