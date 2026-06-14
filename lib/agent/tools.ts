import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WordResponse, ROIActivations } from '@/types';

// Context handed to every tool: a request-scoped Supabase client (RLS enforces
// that the user only sees their own rows) plus the authenticated user id, which
// we also filter on explicitly as defense-in-depth.
export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ok(data: unknown): ToolResult {
  return { content: JSON.stringify(data), isError: false };
}

function fail(message: string): ToolResult {
  return { content: message, isError: true };
}

// ---------------------------------------------------------------------------
// Tool definitions sent to the model. Descriptions are prescriptive about WHEN
// to call each tool — recent Claude models reach for tools conservatively, so
// the trigger conditions matter as much as the capability.
// ---------------------------------------------------------------------------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_speeches',
    description:
      "List the user's analyzed speeches with their scores, status, and dates. " +
      'Call this FIRST whenever the user refers to their speeches in general ' +
      '("my speeches", "my latest one", "which did best"), asks about trends over ' +
      'time, or when you need a speech\'s ID before calling another tool. Returns ' +
      'the newest first.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'complete', 'error'],
          description: 'Optional filter. Use "complete" to only see analyzed speeches.',
        },
        limit: {
          type: 'integer',
          description: 'Max number of speeches to return (default 20, max 50).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_speech_analysis',
    description:
      'Get the full neural analysis for one speech by its ID: overall engagement, ' +
      'cognitive-load and mind-wandering scores, brain-region activations, peak ' +
      'engagement moments, the timestamped engagement-drop feedback points, and the ' +
      'highest/lowest activation words. Use this when the user asks about a specific ' +
      "speech's results, why engagement dropped, their strongest moments, or how to " +
      'improve. Call list_speeches first if you do not already have the ID.',
    input_schema: {
      type: 'object',
      properties: {
        analysis_id: { type: 'string', description: 'The speech/analysis UUID.' },
      },
      required: ['analysis_id'],
    },
  },
  {
    name: 'get_transcript',
    description:
      'Get the full text transcript of a speech by its ID. Use this when the user ' +
      'asks what they said, wants quotes, or wants you to analyze specific wording. ' +
      'Transcripts can be long — only fetch one when the question needs the actual words.',
    input_schema: {
      type: 'object',
      properties: {
        analysis_id: { type: 'string', description: 'The speech/analysis UUID.' },
      },
      required: ['analysis_id'],
    },
  },
  {
    name: 'search_transcripts',
    description:
      "Search across ALL of the user's completed speech transcripts for a word or " +
      'phrase. Returns the matching speeches with short surrounding snippets. Use this ' +
      'when the user wants to find where they said something, or which speeches cover a topic.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The word or phrase to search for.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'compare_speeches',
    description:
      'Compare key metrics across two or more speeches by their IDs (overall ' +
      'engagement, cognitive load, mind-wandering, duration). Use this when the user ' +
      'asks to compare speeches or track improvement over time. Get the IDs from ' +
      'list_speeches first.',
    input_schema: {
      type: 'object',
      properties: {
        analysis_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Two or more speech/analysis UUIDs to compare.',
        },
      },
      required: ['analysis_ids'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executors.
// ---------------------------------------------------------------------------

const LIST_COLUMNS =
  'id, title, status, overall_score, cognitive_load_score, mind_wandering_score, duration_seconds, file_type, is_mock, created_at';

async function listSpeeches(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
  let query = ctx.supabase
    .from('analyses')
    .select(LIST_COLUMNS)
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (typeof input.status === 'string') {
    query = query.eq('status', input.status);
  }

  const { data, error } = await query;
  if (error) return fail(`Could not list speeches: ${error.message}`);
  if (!data || data.length === 0) {
    return ok({ speeches: [], note: 'The user has no speeches matching that filter yet.' });
  }
  return ok({ count: data.length, speeches: data });
}

async function getSpeechAnalysis(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const id = typeof input.analysis_id === 'string' ? input.analysis_id : '';
  if (!id) return fail('analysis_id is required.');

  const [{ data: analysis, error: aErr }, { data: feedback }] = await Promise.all([
    ctx.supabase.from('analyses').select('*').eq('id', id).eq('user_id', ctx.userId).single(),
    ctx.supabase.from('feedback_points').select('*').eq('analysis_id', id).order('timecode_ms'),
  ]);

  if (aErr || !analysis) return fail('No speech found with that ID for this user.');
  if (analysis.status !== 'complete') {
    return ok({
      id: analysis.id,
      title: analysis.title,
      status: analysis.status,
      note: `This speech is "${analysis.status}", so neural results are not available yet.`,
    });
  }

  const words = (analysis.word_responses as WordResponse[] | null) ?? [];
  const topWords = [...words]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((w) => ({ word: w.word, score: w.score, emotional: w.emotional, memory: w.memory, prosody: w.prosody }));
  const bottomWords = [...words]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((w) => ({ word: w.word, score: w.score }));

  const peaks = (analysis.peak_moments as { start_ms: number; end_ms: number; score: number }[] | null) ?? [];
  const brain = analysis.overall_brain_activations as ROIActivations | null;

  return ok({
    id: analysis.id,
    title: analysis.title,
    is_mock: analysis.is_mock ?? false,
    duration_seconds: analysis.duration_seconds,
    scores: {
      overall_engagement: analysis.overall_score,
      cognitive_load: analysis.cognitive_load_score,
      mind_wandering_risk: analysis.mind_wandering_score,
    },
    overall_brain_activations: brain,
    peak_moments: peaks.map((p) => ({
      from: formatMs(p.start_ms),
      to: formatMs(p.end_ms),
      score: p.score,
    })),
    engagement_drops: (feedback ?? []).map((f) => ({
      from: formatMs(f.timecode_ms),
      to: formatMs(f.timecode_end_ms),
      engagement_score: f.engagement_score,
      severity: f.severity,
      what_happened: f.feedback_text,
      fix: f.improvement_suggestion,
    })),
    highest_activation_words: topWords,
    lowest_activation_words: bottomWords,
  });
}

async function getTranscript(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const id = typeof input.analysis_id === 'string' ? input.analysis_id : '';
  if (!id) return fail('analysis_id is required.');

  const { data, error } = await ctx.supabase
    .from('analyses')
    .select('title, transcript, status')
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .single();

  if (error || !data) return fail('No speech found with that ID for this user.');
  if (!data.transcript) {
    return ok({ title: data.title, transcript: null, note: 'No transcript is available for this speech yet.' });
  }
  return ok({ title: data.title, transcript: data.transcript });
}

async function searchTranscripts(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const query = (typeof input.query === 'string' ? input.query : '').trim();
  if (!query) return fail('query is required.');

  const { data, error } = await ctx.supabase
    .from('analyses')
    .select('id, title, transcript, created_at')
    .eq('user_id', ctx.userId)
    .eq('status', 'complete')
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return fail(`Search failed: ${error.message}`);

  const needle = query.toLowerCase();
  const matches: { id: string; title: string; snippets: string[] }[] = [];

  for (const row of data ?? []) {
    const transcript: string = row.transcript ?? '';
    const hay = transcript.toLowerCase();
    if (!hay.includes(needle)) continue;

    const snippets: string[] = [];
    let from = 0;
    while (snippets.length < 3) {
      const idx = hay.indexOf(needle, from);
      if (idx === -1) break;
      const start = Math.max(0, idx - 60);
      const end = Math.min(transcript.length, idx + needle.length + 60);
      snippets.push(`${start > 0 ? '…' : ''}${transcript.slice(start, end).trim()}${end < transcript.length ? '…' : ''}`);
      from = idx + needle.length;
    }
    matches.push({ id: row.id, title: row.title, snippets });
  }

  if (matches.length === 0) {
    return ok({ query, matches: [], note: `No completed speeches mention "${query}".` });
  }
  return ok({ query, match_count: matches.length, matches });
}

async function compareSpeeches(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const ids = Array.isArray(input.analysis_ids)
    ? input.analysis_ids.filter((x): x is string => typeof x === 'string')
    : [];
  if (ids.length < 2) return fail('Provide at least two analysis_ids to compare.');

  const { data, error } = await ctx.supabase
    .from('analyses')
    .select(LIST_COLUMNS)
    .eq('user_id', ctx.userId)
    .in('id', ids);

  if (error) return fail(`Comparison failed: ${error.message}`);
  if (!data || data.length === 0) return fail('None of those IDs match this user\'s speeches.');

  // Preserve the order the caller asked for.
  const byId = new Map(data.map((d) => [d.id, d]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  return ok({
    speeches: ordered.map((s) => ({
      id: (s as Record<string, unknown>).id,
      title: (s as Record<string, unknown>).title,
      status: (s as Record<string, unknown>).status,
      overall_engagement: (s as Record<string, unknown>).overall_score,
      cognitive_load: (s as Record<string, unknown>).cognitive_load_score,
      mind_wandering_risk: (s as Record<string, unknown>).mind_wandering_score,
      duration_seconds: (s as Record<string, unknown>).duration_seconds,
      created_at: (s as Record<string, unknown>).created_at,
    })),
  });
}

const EXECUTORS: Record<string, (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>> = {
  list_speeches: listSpeeches,
  get_speech_analysis: getSpeechAnalysis,
  get_transcript: getTranscript,
  search_transcripts: searchTranscripts,
  compare_speeches: compareSpeeches,
};

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const executor = EXECUTORS[name];
  if (!executor) return fail(`Unknown tool: ${name}`);
  try {
    return await executor((input ?? {}) as Record<string, unknown>, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return fail(`Tool "${name}" failed: ${message}`);
  }
}
