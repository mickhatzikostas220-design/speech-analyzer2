import type { SupabaseClient } from '@supabase/supabase-js';

export type Provider = 'anthropic' | 'openai';
export type Autonomy = 'read_only' | 'draft_confirm' | 'act_directly';

// How risky a tool's side effects are. Drives which tools are exposed to the
// model at each autonomy level.
export type SideEffect = 'none' | 'reversible' | 'irreversible';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// Normalized message shape used internally and translated per-provider.
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[]; // assistant turns that requested tools
  tool_call_id?: string; // tool-result turns
  name?: string; // tool name on tool-result turns
}

export interface ToolContext {
  userId: string;
  supabase: SupabaseClient;
  conversationId: string | null;
}

export interface ToolDef {
  name: string;
  description: string;
  // JSON Schema object describing the arguments.
  parameters: Record<string, unknown>;
  sideEffect: SideEffect;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

// Events streamed (as NDJSON) from the chat route to the browser.
export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; label: string; sideEffect: SideEffect }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'error'; message: string }
  | { type: 'done'; conversationId: string; title: string };
