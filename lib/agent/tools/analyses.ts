import type { ToolDef } from '../types';

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Speech-aware tools: let the agent read the user's own Orator analyses so it
// can draft follow-ups, repurpose talks, or answer questions about results.
export const analysesTools: ToolDef[] = [
  {
    name: 'list_speech_analyses',
    description:
      "List the user's speech/presentation analyses from Orator, most recent first. Use this when the user refers to their speeches, talks, presentations, or past analyses.",
    sideEffect: 'none',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max number to return (default 10).' },
      },
    },
    async execute(args, ctx) {
      const limit = Math.min(Number(args.limit) || 10, 25);
      const { data, error } = await ctx.supabase
        .from('analyses')
        .select('id, title, overall_score, status, duration_seconds, created_at')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return 'No analyses found for this user yet.';
      return data
        .map(
          (a) =>
            `- id=${a.id} | "${a.title}" | score=${a.overall_score ?? 'n/a'}/100 | status=${a.status} | ${new Date(
              a.created_at as string
            ).toLocaleDateString()}`
        )
        .join('\n');
    },
  },
  {
    name: 'get_speech_analysis',
    description:
      'Get detailed neural-engagement results for one speech analysis by id: overall scores, the biggest engagement drops with timestamps, and the transcript. Call list_speech_analyses first to get the id.',
    sideEffect: 'none',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The analysis id.' },
      },
      required: ['id'],
    },
    async execute(args, ctx) {
      const id = String(args.id || '');
      if (!id) return 'Error: id is required.';
      const { data: analysis } = await ctx.supabase
        .from('analyses')
        .select('*')
        .eq('id', id)
        .eq('user_id', ctx.userId)
        .maybeSingle();
      if (!analysis) return 'Analysis not found.';

      const { data: feedback } = await ctx.supabase
        .from('feedback_points')
        .select('timecode_ms, timecode_end_ms, engagement_score, severity, feedback_text, improvement_suggestion')
        .eq('analysis_id', id)
        .order('timecode_ms');

      const drops = (feedback ?? [])
        .map(
          (f) =>
            `  ${formatMs(f.timecode_ms as number)}–${formatMs(f.timecode_end_ms as number)} (${f.engagement_score}/100, ${f.severity}): ${f.feedback_text} Fix: ${f.improvement_suggestion}`
        )
        .join('\n');

      const transcript = (analysis.transcript as string | null) ?? '';
      return [
        `Title: ${analysis.title}`,
        `Overall engagement: ${analysis.overall_score ?? 'n/a'}/100`,
        `Cognitive load: ${analysis.cognitive_load_score ?? 'n/a'}/100`,
        `Mind-wandering risk: ${analysis.mind_wandering_score ?? 'n/a'}/100`,
        `Duration: ${analysis.duration_seconds ?? 'n/a'}s`,
        '',
        'Engagement drops:',
        drops || '  none detected',
        '',
        'Transcript:',
        transcript ? transcript.slice(0, 4000) : '  (not available)',
      ].join('\n');
    },
  },
];
