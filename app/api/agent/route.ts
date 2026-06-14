import { createClient } from '@/lib/supabase/server';
import { runAgent, type AgentEvent, type ChatTurn } from '@/lib/agent/agent';
import { NextRequest } from 'next/server';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('The assistant is not configured (missing ANTHROPIC_API_KEY).', {
      status: 503,
    });
  }

  const body = await request.json().catch(() => null);
  const rawMessages = body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return new Response('Bad request', { status: 400 });
  }

  // Only trust role + string content from the client; the agent rebuilds all
  // tool calls server-side.
  const history: ChatTurn[] = rawMessages
    .filter(
      (m: unknown): m is ChatTurn =>
        typeof m === 'object' &&
        m !== null &&
        ((m as ChatTurn).role === 'user' || (m as ChatTurn).role === 'assistant') &&
        typeof (m as ChatTurn).content === 'string' &&
        (m as ChatTurn).content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content }));

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return new Response('Bad request', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      try {
        for await (const event of runAgent(history, { supabase, userId: user.id })) {
          send(event);
        }
      } catch {
        send({ type: 'error', message: 'The assistant hit an error. Please try again.' });
        send({ type: 'done' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
