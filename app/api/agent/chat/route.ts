import { NextRequest } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { getApiKey, getSettings } from '@/lib/agent/store';
import { buildTools } from '@/lib/agent/tools/registry';
import { buildSystemPrompt } from '@/lib/agent/prompt';
import { runAgent } from '@/lib/agent/providers';
import { PROVIDER_LABEL } from '@/lib/agent/models';
import type { AgentEvent, ChatMessage } from '@/lib/agent/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  let conversationId: string | null =
    typeof body.conversationId === 'string' ? body.conversationId : null;
  if (!message) return new Response('Empty message', { status: 400 });

  const { admin, user } = auth;

  const settings = await getSettings(admin, user.id);
  const apiKey = await getApiKey(admin, user.id, settings.provider);
  if (!apiKey) {
    return Response.json(
      {
        error: `No ${PROVIDER_LABEL[settings.provider]} API key set. Add one in Agent → Settings to start chatting.`,
      },
      { status: 400 }
    );
  }

  // Resolve or create the conversation.
  if (conversationId) {
    const { data } = await admin
      .from('agent_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) conversationId = null;
  }
  let title = '';
  if (!conversationId) {
    title = message.length > 60 ? `${message.slice(0, 60)}…` : message;
    const { data, error } = await admin
      .from('agent_conversations')
      .insert({ user_id: user.id, title })
      .select('id, title')
      .single();
    if (error || !data) return new Response('Failed to start conversation', { status: 500 });
    conversationId = data.id;
    title = data.title;
  }

  // Persist the user's message, then load the full thread for context.
  await admin
    .from('agent_messages')
    .insert({ conversation_id: conversationId, user_id: user.id, role: 'user', content: message });

  const { data: rows } = await admin
    .from('agent_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const history: ChatMessage[] = (rows ?? []).map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
  }));

  const { tools, notes } = await buildTools(admin, user.id);
  const system = buildSystemPrompt({
    userEmail: user.email ?? null,
    toolNotes: notes,
    custom: settings.system_prompt,
  });

  const finalConversationId: string = conversationId!;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const { text } = await runAgent({
          provider: settings.provider,
          apiKey,
          model: settings.model,
          system,
          history,
          tools,
          ctx: { userId: user.id, supabase: admin, conversationId: finalConversationId },
          onText: (delta) => send({ type: 'text', delta }),
          onTool: (name, label, sideEffect) => send({ type: 'tool', name, label, sideEffect }),
          onToolResult: (name, ok, summary) =>
            send({ type: 'tool_result', name, ok, summary }),
        });

        await admin.from('agent_messages').insert({
          conversation_id: finalConversationId,
          user_id: user.id,
          role: 'assistant',
          content: text || '(no response)',
        });
        await admin
          .from('agent_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', finalConversationId);

        send({ type: 'done', conversationId: finalConversationId, title });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Something went wrong.';
        send({ type: 'error', message: msg });
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
