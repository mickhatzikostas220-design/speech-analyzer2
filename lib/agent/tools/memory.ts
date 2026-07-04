import type { ToolDef } from '../types';
import { saveMemory } from '@/lib/memory/store';

// Memory tool: lets the assistant explicitly remember durable facts about the
// user when they ask ("remember that…") or when they share something lasting.
// sideEffect is 'none' — writing to the user's own memory is internal and safe,
// so it's always available regardless of connection autonomy. Auto-capture also
// runs separately in the chat route; this tool is the explicit, on-request path.
export const memoryTools: ToolDef[] = [
  {
    name: 'remember_fact',
    description:
      "Save a durable, personal fact about the user so you can recall it in future conversations. Use when the user explicitly asks you to remember something, or when they share a lasting fact about themselves (a goal, an upcoming talk, a standing preference for how they want help). Do NOT use for one-off requests, questions, or transient details.",
    sideEffect: 'none',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The fact to remember, written as a short standalone statement, e.g. "Has a keynote at SXSW in March 2027." Keep it under 300 characters.',
        },
        category: {
          type: 'string',
          enum: ['goal', 'preference', 'fact', 'event', 'style', 'other'],
          description: 'Best-fit bucket for the fact.',
        },
      },
      required: ['content'],
    },
    async execute(args, ctx) {
      const content = String(args.content || '').trim();
      if (!content) return 'Error: nothing to remember (content was empty).';
      const row = await saveMemory(ctx.supabase, ctx.userId, content, {
        category: args.category,
        source: 'explicit',
      });
      if (!row) {
        // Either memory is off, or we already remember this — both are fine.
        return 'Already remembered (or memory is turned off in Settings).';
      }
      return `Remembered: "${row.content}"`;
    },
  },
];
