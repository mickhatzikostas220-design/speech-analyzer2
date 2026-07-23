import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
// Allow headroom for a Parakeet cold start (Vercel Pro honors up to 300s; Hobby
// caps at 60s, in which case keep a warm Modal container via min_containers=1).
export const maxDuration = 300;

// Transcription is the single most expensive call in the app (GPU / Whisper
// minutes). Cap the upload size and throttle per user so one account can't run
// up cost by firing large clips in a loop.
const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limit = rateLimit(`transcribe:${user.id}`, 10, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many transcription requests. Give it a minute and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      );
    }

    const formData = await request.formData();
    const audio = formData.get('audio') as Blob | null;
    if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'That audio file is too large to transcribe (100 MB max).' },
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
        const errText = await res.text();
        return NextResponse.json({ error: `Parakeet error: ${errText}` }, { status: 502 });
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
      const errText = await res.text();
      return NextResponse.json({ error: `OpenAI error: ${errText}` }, { status: 502 });
    }

    const text = (await res.text()).trim();
    const data = text ? JSON.parse(text) : {};

    return NextResponse.json({ words: data.words ?? [], text: data.text ?? '' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Unexpected: ${msg}` }, { status: 500 });
  }
}
