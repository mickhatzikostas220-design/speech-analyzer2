import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logAction } from './store';
import type { ChatMessage, Provider, SideEffect, ToolCall, ToolContext, ToolDef } from './types';

const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 2048;

export interface RunAgentParams {
  provider: Provider;
  apiKey: string;
  model: string;
  system: string;
  history: ChatMessage[];
  tools: ToolDef[];
  ctx: ToolContext;
  onText: (delta: string) => void;
  onTool: (name: string, label: string, sideEffect: SideEffect) => void;
  onToolResult: (name: string, ok: boolean, summary: string) => void;
}

interface Turn {
  text: string;
  toolCalls: ToolCall[];
}

// Runs the agentic loop: stream a turn, execute any requested tools (respecting
// the exposed tool set), feed results back, repeat until the model stops calling
// tools. Returns the final assistant text + the tool calls that were executed.
export async function runAgent(p: RunAgentParams): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const messages: ChatMessage[] = [...p.history];
  let finalText = '';
  const executed: ToolCall[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn =
      p.provider === 'anthropic'
        ? await anthropicTurn(p, messages)
        : await openaiTurn(p, messages);

    if (turn.text) finalText = turn.text;

    messages.push({
      role: 'assistant',
      content: turn.text,
      tool_calls: turn.toolCalls.length ? turn.toolCalls : undefined,
    });

    if (turn.toolCalls.length === 0) break;

    for (const call of turn.toolCalls) {
      const tool = p.tools.find((t) => t.name === call.name);
      executed.push(call);
      if (!tool) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: `Error: unknown tool ${call.name}`,
        });
        continue;
      }

      p.onTool(tool.name, describeCall(tool, call), tool.sideEffect);

      let result: string;
      let ok = true;
      try {
        result = await tool.execute(call.args, p.ctx);
        if (result.startsWith('Error') || result.startsWith('Gmail error')) ok = false;
      } catch (e) {
        ok = false;
        result = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }

      p.onToolResult(tool.name, ok, summarize(result));

      if (tool.sideEffect !== 'none') {
        await logAction(
          p.ctx.supabase,
          p.ctx.userId,
          p.ctx.conversationId,
          tool.name,
          call.args,
          ok ? 'executed' : 'failed',
          result
        );
      }

      messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: result });
    }
  }

  return { text: finalText, toolCalls: executed };
}

// ---- Anthropic -----------------------------------------------------------

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls ?? []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      }
      out.push({ role: 'assistant', content: blocks.length ? blocks : ' ' });
    } else if (m.role === 'tool' && m.tool_call_id) {
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }],
      });
    }
  }
  return out;
}

async function anthropicTurn(p: RunAgentParams, messages: ChatMessage[]): Promise<Turn> {
  const client = new Anthropic({ apiKey: p.apiKey });
  const tools = p.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  })) as unknown as Anthropic.Tool[];

  const stream = client.messages.stream({
    model: p.model,
    max_tokens: MAX_TOKENS,
    system: p.system,
    messages: toAnthropicMessages(messages),
    ...(tools.length ? { tools } : {}),
  });

  stream.on('text', (delta) => p.onText(delta));
  const final = await stream.finalMessage();

  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of final.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        args: (block.input ?? {}) as Record<string, unknown>,
      });
    }
  }
  return { text, toolCalls };
}

// ---- OpenAI --------------------------------------------------------------

function toOpenAIMessages(
  system: string,
  messages: ChatMessage[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
  ];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        });
      } else {
        out.push({ role: 'assistant', content: m.content });
      }
    } else if (m.role === 'tool' && m.tool_call_id) {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content });
    }
  }
  return out;
}

async function openaiTurn(p: RunAgentParams, messages: ChatMessage[]): Promise<Turn> {
  const client = new OpenAI({ apiKey: p.apiKey });
  const tools = p.tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const stream = await client.chat.completions.create({
    model: p.model,
    messages: toOpenAIMessages(p.system, messages),
    ...(tools.length ? { tools } : {}),
    stream: true,
  });

  let text = '';
  const acc: Record<number, { id: string; name: string; args: string }> = {};
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      text += delta.content;
      p.onText(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const slot = (acc[tc.index] ??= { id: '', name: '', args: '' });
      if (tc.id) slot.id = tc.id;
      if (tc.function?.name) slot.name = tc.function.name;
      if (tc.function?.arguments) slot.args += tc.function.arguments;
    }
  }

  const toolCalls: ToolCall[] = Object.values(acc)
    .filter((a) => a.name)
    .map((a) => ({ id: a.id || a.name, name: a.name, args: safeParse(a.args) }));
  return { text, toolCalls };
}

// ---- helpers -------------------------------------------------------------

function safeParse(s: string): Record<string, unknown> {
  try {
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function summarize(result: string): string {
  const firstLine = result.split('\n')[0] ?? '';
  return firstLine.length > 140 ? `${firstLine.slice(0, 140)}…` : firstLine;
}

function describeCall(tool: ToolDef, call: ToolCall): string {
  const a = call.args;
  switch (tool.name) {
    case 'gmail_search_messages':
      return `Searching Gmail: "${a.query}"`;
    case 'gmail_read_message':
      return 'Reading an email';
    case 'gmail_create_draft':
      return `Drafting email to ${a.to}`;
    case 'gmail_send_message':
      return `Sending email to ${a.to}`;
    case 'list_speech_analyses':
      return 'Listing your speech analyses';
    case 'get_speech_analysis':
      return 'Reading a speech analysis';
    case 'calendar_list_events':
      return a.query ? `Checking your calendar: "${a.query}"` : 'Checking your calendar';
    case 'social_media_overview':
      return 'Reviewing your social media activity';
    default:
      return tool.name;
  }
}
