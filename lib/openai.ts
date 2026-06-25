import OpenAI from 'openai';

let _openai: OpenAI | null = null;

/** Lazily construct the OpenAI client so importing this module never throws
 *  at build time when OPENAI_API_KEY is absent. */
function client(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
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

  const response = await client().audio.transcriptions.create({
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

  const response = await client().chat.completions.create({
    model: 'gpt-4o',
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

export interface AeoSeoResult {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  faq: { question: string; answer: string }[];
  jsonLd: Record<string, unknown>;
}

/**
 * Answer-Engine / Search-Engine optimization content for a talk. Produces a
 * meta title/description, keywords, an AEO-friendly FAQ (the Q&A shape that
 * answer engines surface), and a JSON-LD blob for an indexable talk page.
 */
export async function generateAeoContent(params: {
  speakerName: string;
  talkTitle: string;
  topic: string;
  audience?: string;
}): Promise<AeoSeoResult> {
  const { speakerName, talkTitle, topic, audience } = params;

  const response = await client().chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an SEO and Answer-Engine-Optimization (AEO) specialist for professional speakers. Given a talk, return JSON to help the speaker rank in Google and be cited by AI answer engines.

Return ONLY a JSON object with this exact shape:
{
  "metaTitle": "under 60 characters, includes the speaker name",
  "metaDescription": "under 155 characters, compelling, includes the topic",
  "keywords": ["6-10 search phrases a booker would actually type"],
  "faq": [{"question": "...", "answer": "..."}, ...]  // 4-6 conversational Q&As an answer engine would surface
}`,
      },
      {
        role: 'user',
        content: `Speaker: ${speakerName}
Talk title: ${talkTitle}
Topic / description: ${topic}
${audience ? `Target audience: ${audience}` : ''}`,
      },
    ],
    max_tokens: 900,
    temperature: 0.7,
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  let parsed: Partial<AeoSeoResult> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const metaTitle = parsed.metaTitle ?? `${talkTitle} — ${speakerName}`;
  const metaDescription = parsed.metaDescription ?? topic.slice(0, 150);
  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  const faq = Array.isArray(parsed.faq) ? parsed.faq : [];

  // Assemble JSON-LD locally so it always reflects the real fields.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: speakerName,
    jobTitle: 'Speaker',
    description: metaDescription,
    knowsAbout: keywords,
    subjectOf: {
      '@type': 'Event',
      name: talkTitle,
      description: topic,
    },
    ...(faq.length
      ? {
          mainEntityOfPage: {
            '@type': 'FAQPage',
            mainEntity: faq.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: { '@type': 'Answer', text: f.answer },
            })),
          },
        }
      : {}),
  };

  return { metaTitle, metaDescription, keywords, faq, jsonLd };
}
