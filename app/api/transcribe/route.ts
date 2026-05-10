import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const audio = formData.get('audio') as Blob | null;
    if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 });

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
