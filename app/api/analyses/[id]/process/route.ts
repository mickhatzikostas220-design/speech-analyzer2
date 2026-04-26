import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { callTribeV2 } from '@/lib/tribe';
import { transcribeAudio, generateFeedback } from '@/lib/openai';

export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: analysis } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (analysis.status !== 'pending' && analysis.status !== 'error') {
    return NextResponse.json({ error: 'Analysis already started' }, { status: 409 });
  }

  // Clear stale results when retrying a failed analysis
  if (analysis.status === 'error') {
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
    // Get a signed URL so the GPU server (or mock) can reference the file
    const { data: signedData } = await supabase.storage
      .from('speeches')
      .createSignedUrl(analysis.file_path, 3600);
    const signedUrl = signedData?.signedUrl ?? '';

    // Transcribe audio/video with Whisper
    let transcript = '';
    let words: { word: string; start: number; end: number }[] = [];
    let durationSeconds: number = analysis.duration_seconds ?? 60;

    try {
      const { data: fileBlob } = await supabase.storage
        .from('speeches')
        .download(analysis.file_path);

      if (fileBlob) {
        const filename = analysis.file_path.split('/').pop() ?? 'file';
        const result = await transcribeAudio(fileBlob, filename);
        transcript = result.text;
        words = result.words;
        if (result.durationSeconds > 0) durationSeconds = result.durationSeconds;
      }
    } catch (transcribeErr) {
      console.error('Transcription failed, continuing without transcript:', transcribeErr);
      transcript = '[Transcription unavailable — audio could not be processed]';
    }

    // Update transcript
    await supabase
      .from('analyses')
      .update({ transcript, duration_seconds: durationSeconds })
      .eq('id', params.id);

    // Call Tribe v2 (real GPU server or mock)
    const tribeResult = await callTribeV2(signedUrl, durationSeconds);

    // Store engagement timeline in batches
    const timelineRows = tribeResult.engagement_timeline.map((t) => ({
      analysis_id: params.id,
      timecode_ms: t.timecode_ms,
      score: t.score,
    }));

    for (let i = 0; i < timelineRows.length; i += 200) {
      await supabase.from('engagement_timeline').insert(timelineRows.slice(i, i + 200));
    }

    // Generate GPT-4o feedback for each low engagement moment (cap at 8)
    const brainMoments = tribeResult.brain_activations?.moments ?? [];
    const feedbackRows = [];
    let momentIdx = 0;
    for (const moment of tribeResult.low_engagement_moments.slice(0, 8)) {
      const startSec = moment.start_ms / 1000;
      const endSec = moment.end_ms / 1000;

      const segment = words.length > 0
        ? words
            .filter((w) => w.start >= startSec - 1.5 && w.end <= endSec + 1.5)
            .map((w) => w.word)
            .join(' ')
        : '';

      let fb = { feedback: 'Engagement dropped here.', suggestion: 'Vary your tone or add a specific example.' };

      if (transcript) {
        try {
          fb = await generateFeedback({
            transcriptSegment: segment || transcript.slice(
              Math.floor((startSec / durationSeconds) * transcript.length),
              Math.floor((endSec / durationSeconds) * transcript.length)
            ) || '[unavailable]',
            startSeconds: startSec,
            engagementScore: moment.score,
            fullTranscript: transcript,
          });
        } catch (feedbackErr) {
          console.error('Feedback generation failed for moment:', feedbackErr);
        }
      }

      feedbackRows.push({
        analysis_id: params.id,
        timecode_ms: moment.start_ms,
        timecode_end_ms: moment.end_ms,
        engagement_score: moment.score,
        feedback_text: fb.feedback,
        improvement_suggestion: fb.suggestion,
        severity: moment.score < 38 ? 'high' : moment.score < 47 ? 'medium' : 'low',
        brain_activations: brainMoments[momentIdx] ?? null,
      });
      momentIdx++;
    }

    if (feedbackRows.length > 0) {
      await supabase.from('feedback_points').insert(feedbackRows);
    }

    await supabase
      .from('analyses')
      .update({
        overall_score: tribeResult.overall_score,
        status: 'complete',
        overall_brain_activations: tribeResult.brain_activations?.overall ?? null,
        is_mock: tribeResult.is_mock ?? false,
      })
      .eq('id', params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('analyses')
      .update({ status: 'error', error_message: msg })
      .eq('id', params.id);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
