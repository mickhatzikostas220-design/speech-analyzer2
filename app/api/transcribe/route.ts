import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
// Allow headroom for a Parakeet cold start (Vercel Pro honors up to 300s; Hobby
// caps at 60s, in which case keep a warm Modal container via min_containers=1).
export const maxDuration = 300;

// Whisper's own hard limit is 25 MB; reject anything larger before we pay to
// forward it upstream. Guards against a single account running up unbounded
// OpenAI/GPU cost with huge or looped uploads.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Transcription is a paid upstream call; cap how often one account can fire it.
    const rl = rateLimit(`transcribe:${user.id}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many transcription requests — please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const formData = await request.formData();
    const audio = formData.get('audio') as Blob | null;
    if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'Audio is too large. Please keep clips under 25 MB.' },
        { status: 413 }
      );
    }

    // Prefer the self-hosted Parakeet (parakeet-tdt-0.6b-v3) GPU server when
    // configured; otherwise fall back to OpenAI Whisper. Both return the same
    // { words: [{ word, start, end }], text } shape the script matcher consumes.
    const parakeetUrl = process.env.PARAKEET_SERVER_URL;
    if (parakeetUrl) {
      const form = new FormData();
      form.append('audio', audio, 'audio.mp3');

      const headers: Record<string, string> = {};
      if (process.env.PARAKEET_SERVER_SECRET) {
        headers.Authorization = `Bearer ${process.env.PARAKEET_SERVER_SECRET}`;
      }

      const res = await fetch(parakeetUrl, { method: 'POST', body: form, headers });
      if (!res.ok) {
        console.error('[transcribe] Parakeet error', res.status, await res.text().catch(() => ''));
        return NextResponse.json({ error: 'Transcription failed. Please try again.' }, { status: 502 });
      }

      const text = (await res.text()).trim();
      const data = text ? JSON.parse(text) : {};
      return NextResponse.json({ words: data.words ?? [], text: data.text ?? '' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const openAiForm = new FormData();
    openAiForm.append('file', audio, 'audio.mp3');
    openAiForm.append('model', 'whisper-1');
    openAiForm.append('response_format', 'verbose_json');
    openAiForm.append('timestamp_granularities[]', 'word');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: openAiForm,
    });

    if (!res.ok) {
      console.error('[transcribe] OpenAI error', res.status, await res.text().catch(() => ''));
      return NextResponse.json({ error: 'Transcription failed. Please try again.' }, { status: 502 });
    }

    const text = (await res.text()).trim();
    const data = text ? JSON.parse(text) : {};

    return NextResponse.json({ words: data.words ?? [], text: data.text ?? '' });
  } catch (err) {
    console.error('[transcribe] unexpected error', err);
    return NextResponse.json({ error: 'Something went wrong transcribing that audio.' }, { status: 500 });
  }
}
