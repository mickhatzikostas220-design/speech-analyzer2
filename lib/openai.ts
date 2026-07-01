import OpenAI from 'openai';
import { createChatCompletion } from './ai-config';

// Lazily instantiate the AI clients on first use. Creating them at module load
// time throws when the key is absent (e.g. during `next build`, which evaluates
// route modules without runtime env), breaking the build.
//
// Two separate clients: transcription must run on OpenAI directly (Whisper has
// no OpenRouter equivalent), while chat/completions go through the app-wide
// client, which is OpenRouter when OPENROUTER_API_KEY is set (see lib/ai-config).
let _transcribe: OpenAI | null = null;
function getTranscribeClient(): OpenAI {
  if (!_transcribe) {
    _transcribe = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _transcribe;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export async function transcribeAudio(
  blob: Blob,
  filename: string
): Promise<{ text: string; words: TranscriptWord[]; durationSeconds: number }> {
  const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' });

  const response = await getTranscribeClient().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  const words: TranscriptWord[] = (response.words ?? []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));

  const durationSeconds =
    words.length > 0 ? words[words.length - 1].end : (response.duration ?? 60);

  return { text: response.text, words, durationSeconds };
}

export async function generateFeedback(params: {
  transcriptSegment: string;
  startSeconds: number;
  engagementScore: number;
  fullTranscript: string;
}): Promise<{ feedback: string; suggestion: string }> {
  const { transcriptSegment, startSeconds, engagementScore, fullTranscript } = params;

  const minutes = Math.floor(startSeconds / 60);
  const seconds = Math.floor(startSeconds % 60);
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const response = await createChatCompletion('gpt-4o', {
    messages: [
      {
        role: 'system',
        content: `You are a professional speech coach. Neural engagement scores (0–100) represent audience brain activation measured via fMRI. Below 55 means the audience's attention is dropping.

Give exactly two lines:
Line 1: What specifically caused the engagement drop at this moment (reference the actual words).
Line 2: One concrete fix for this exact moment — not generic advice.

Each line must be one sentence, under 20 words.`,
      },
      {
        role: 'user',
        content: `At ${timeLabel}, neural engagement dropped to ${engagementScore}/100.

Speaker said: "${transcriptSegment}"

Full speech (first 400 chars): "${fullTranscript.slice(0, 400)}"`,
      },
    ],
    max_tokens: 120,
    temperature: 0.6,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? '';
  const lines = content.split('\n').filter(Boolean);

  return {
    feedback: lines[0] ?? 'Neural engagement dropped here.',
    suggestion: lines[1] ?? 'Add a concrete example or vary your vocal pacing.',
  };
}
