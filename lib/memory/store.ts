// The memory store — the layer that makes the app feel personal.
//
// One row = one durable fact about the user (a goal, an upcoming talk, a style
// preference). Memories are captured explicitly ("remember that…") or
// automatically by a background extractor, then fed back into every AI feature
// via getMemoryContext(). Users own their memories: view / edit / delete / off.
//
// Every function takes an explicit (supabase, userId) pair — matching
// lib/agent/store.ts — so both the signed-in server client and the service-role
// admin client (used by the agent tool + background extractor) can call in.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Loose display buckets. Anything unrecognized normalizes to 'other'. */
export const MEMORY_CATEGORIES = [
  'goal',
  'preference',
  'fact',
  'event',
  'style',
  'other',
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemorySource = 'auto' | 'explicit';

export interface MemoryRow {
  id: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  created_at: string;
  updated_at: string;
}

// Guardrails so memory can't balloon or store essays.
const MAX_CONTENT_LEN = 500;
const MAX_MEMORIES_PER_USER = 300;
// How many memories we inject into an AI prompt (newest first). Keeps context
// tight and cost predictable even for power users.
const CONTEXT_LIMIT = 40;

function normalizeCategory(value: unknown): MemoryCategory {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (MEMORY_CATEGORIES as readonly string[]).includes(v)
    ? (v as MemoryCategory)
    : 'other';
}

/** Whether the user has memory turned on. Defaults to true (column may be absent). */
export async function isMemoryEnabled(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('memory_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return true;
  // null (column just added, never set) counts as enabled.
  return data.memory_enabled !== false;
}

export async function setMemoryEnabled(
  supabase: SupabaseClient,
  userId: string,
  enabled: boolean
): Promise<void> {
  await supabase.from('profiles').update({ memory_enabled: enabled }).eq('id', userId);
}

/**
 * Save one fact. Returns the new row, or null when nothing was stored (memory
 * off, empty text, a near-duplicate already exists, or the cap is reached and
 * this is an auto capture). Never throws — a failed memory write must never
 * break the feature that triggered it.
 */
export async function saveMemory(
  supabase: SupabaseClient,
  userId: string,
  content: string,
  opts: { category?: unknown; source?: MemorySource } = {}
): Promise<MemoryRow | null> {
  const text = (content ?? '').trim().slice(0, MAX_CONTENT_LEN);
  if (!text) return null;

  const source: MemorySource = opts.source === 'auto' ? 'auto' : 'explicit';

  try {
    if (!(await isMemoryEnabled(supabase, userId))) return null;

    // Dedupe: skip if we already remember something essentially identical
    // (case-insensitive exact match on the trimmed content).
    const { data: existing } = await supabase
      .from('user_memories')
      .select('id, content')
      .eq('user_id', userId);

    const rows = existing ?? [];
    const norm = text.toLowerCase();
    if (rows.some((r) => (r.content as string).trim().toLowerCase() === norm)) {
      return null;
    }

    // Cap runaway growth. Explicit saves (user asked) still go through and the
    // oldest auto memory is pruned to make room; auto saves stop at the cap.
    if (rows.length >= MAX_MEMORIES_PER_USER) {
      if (source === 'auto') return null;
      const { data: oldestAuto } = await supabase
        .from('user_memories')
        .select('id')
        .eq('user_id', userId)
        .eq('source', 'auto')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (oldestAuto) {
        await supabase.from('user_memories').delete().eq('id', oldestAuto.id).eq('user_id', userId);
      }
    }

    const { data, error } = await supabase
      .from('user_memories')
      .insert({
        user_id: userId,
        content: text,
        category: normalizeCategory(opts.category),
        source,
      })
      .select('id, content, category, source, created_at, updated_at')
      .single();

    if (error || !data) return null;
    return data as MemoryRow;
  } catch {
    return null;
  }
}

export async function listMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<MemoryRow[]> {
  const { data } = await supabase
    .from('user_memories')
    .select('id, content, category, source, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as MemoryRow[];
}

export async function updateMemory(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  content: string
): Promise<MemoryRow | null> {
  const text = (content ?? '').trim().slice(0, MAX_CONTENT_LEN);
  if (!text) return null;
  const { data, error } = await supabase
    .from('user_memories')
    .update({ content: text, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, content, category, source, created_at, updated_at')
    .single();
  if (error || !data) return null;
  return data as MemoryRow;
}

export async function deleteMemory(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<void> {
  await supabase.from('user_memories').delete().eq('id', id).eq('user_id', userId);
}

/**
 * The raw read-back: the user's remembered facts as plain strings, newest first.
 * Returns [] when memory is off or empty. Non-conversational AI features
 * (calibration, copy generation) use this to phrase the facts their own way.
 */
export async function getMemoryFacts(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  try {
    if (!(await isMemoryEnabled(supabase, userId))) return [];
    const { data } = await supabase
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_LIMIT);
    return (data ?? []).map((r) => (r.content as string).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The conversational read-back: a compact block of the user's memories, ready to
 * drop into an AI assistant's system prompt. Returns '' when memory is off or
 * empty, so callers can safely concatenate. This is the hook the chat agent uses.
 */
export async function getMemoryContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const items = await getMemoryFacts(supabase, userId);
  if (items.length === 0) return '';
  return [
    'What you remember about this user (from things they told you earlier — use it to personalize your help, but never claim you remember more than this):',
    ...items.map((c) => `- ${c}`),
  ].join('\n');
}
