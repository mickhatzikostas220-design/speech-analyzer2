import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';
import { TOOLS, executeTool, type ToolContext } from './tools';

const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 8; // safety cap on the tool-use loop

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string }
  | { type: 'tool_result'; name: string; ok: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are ACA's neural speech-analysis assistant. ACA analyzes \
speeches and presentations with Facebook Research's Tribe v2 fMRI-based brain-encoding \
model, producing timestamped neural-engagement feedback.

You have tools that read the signed-in user's own speeches and analyses. Use them to \
ground every answer in their real data — never invent scores, timestamps, or quotes. \
When the user refers to their speeches in general, call list_speeches first to find the \
relevant one(s), then fetch detail as needed.

## How to read the scores (all 0–100)
- Overall Engagement, Auditory, Language, Attention, Prosody, Emotional, Memory: higher is better.
- Cognitive Load (Attention network): higher means the audience is working harder to follow.
- Mind-Wandering Risk (Default Mode Network): LOWER is better — high values mean the audience is zoning out.
- An engagement drop is any moment scoring below 55/100.

## Style
- Be conversational, specific, and actionable — you are a coach, not a data dump.
- Reference exact timestamps (m:ss) and concrete words/phrases when relevant.
- Don't recite every number you retrieved; answer the question the user actually asked.
- If a speech is still processing or uses mock data, say so plainly.
- For minor choices, just make them and note it; only ask the user when truly blocked.`;

/**
 * Runs the agentic loop for one user turn and yields streaming events:
 * text deltas, tool-use/tool-result status, and a terminal done/error.
 */
export async function* runAgent(
  history: ChatTurn[],
  ctx: ToolContext,
): AsyncGenerator<AgentEvent> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = getAnthropic().messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    messages.push({ role: 'assistant', content: final.content });

    if (final.stop_reason !== 'tool_use') {
      yield { type: 'done' };
      return;
    }

    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      yield { type: 'tool_use', name: tu.name };
      const result = await executeTool(tu.name, tu.input, ctx);
      yield { type: 'tool_result', name: tu.name, ok: !result.isError };
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result.content,
        is_error: result.isError,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Hit the iteration cap without a natural stop.
  yield { type: 'error', message: 'The assistant took too many steps. Please try rephrasing.' };
  yield { type: 'done' };
}
