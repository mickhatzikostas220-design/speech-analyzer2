// Tool-run history store — durable, per-user persistence for the tools that used
// to lose their output on navigation (SEO/AEO, Content Ideas, Stage Finder,
// Compare). One row = one generated result. See supabase/tool_runs.sql.
//
// Mirrors lib/memory/store.ts: every function takes an explicit (supabase, userId)
// pair and is fully defensive — a persistence failure must never break the tool
// that produced the result, so writes/reads swallow errors and return null/[].

import type { SupabaseClient } from '@supabase/supabase-js';

export type ToolRunTool = 'seo' | 'content_ideas' | 'stagefinder' | 'compare';

export interface ToolRun {
  id: string;
  tool: string;
  title: string | null;
  input: unknown;
  output: unknown;
  created_at: string;
}

/** Lightweight history entry (no heavy output payload). */
export interface ToolRunSummary {
  id: string;
  title: string | null;
  created_at: string;
}

// Keep only the most recent N runs per tool per user so history can't grow without
// bound. Generous enough that nobody loses recent work.
const MAX_RUNS_PER_TOOL = 30;

/**
 * Save one generated result. Returns the new row (or null on any failure). Prunes
 * older runs beyond the cap. Never throws.
 */
export async function saveToolRun(
  supabase: SupabaseClient,
  userId: string,
  run: { tool: ToolRunTool; title?: string | null; input?: unknown; output: unknown }
): Promise<ToolRun | null> {
  try {
    const { data, error } = await supabase
      .from('tool_runs')
      .insert({
        user_id: userId,
        tool: run.tool,
        title: (run.title ?? '').toString().slice(0, 300) || null,
        input: run.input ?? null,
        output: run.output ?? null,
      })
      .select('id, tool, title, input, output, created_at')
      .single();

    if (error || !data) return null;

    // Best-effort prune: drop anything older than the newest MAX_RUNS_PER_TOOL.
    try {
      const { data: keep } = await supabase
        .from('tool_runs')
        .select('id')
        .eq('user_id', userId)
        .eq('tool', run.tool)
        .order('created_at', { ascending: false })
        .limit(MAX_RUNS_PER_TOOL);
      if (keep && keep.length >= MAX_RUNS_PER_TOOL) {
        const keepIds = keep.map((r) => r.id as string);
        await supabase
          .from('tool_runs')
          .delete()
          .eq('user_id', userId)
          .eq('tool', run.tool)
          .not('id', 'in', `(${keepIds.join(',')})`);
      }
    } catch {
      /* pruning is optional — ignore */
    }

    return data as ToolRun;
  } catch {
    return null;
  }
}

/** The user's most recent run for a tool, full payload — or null. */
export async function getLatestToolRun(
  supabase: SupabaseClient,
  userId: string,
  tool: ToolRunTool
): Promise<ToolRun | null> {
  try {
    const { data } = await supabase
      .from('tool_runs')
      .select('id, tool, title, input, output, created_at')
      .eq('user_id', userId)
      .eq('tool', tool)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as ToolRun) ?? null;
  } catch {
    return null;
  }
}

/** A specific run by id, scoped to the owner — or null. */
export async function getToolRun(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<ToolRun | null> {
  try {
    const { data } = await supabase
      .from('tool_runs')
      .select('id, tool, title, input, output, created_at')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    return (data as ToolRun) ?? null;
  } catch {
    return null;
  }
}

/** Recent history for a tool (metadata only), newest first. */
export async function listToolRuns(
  supabase: SupabaseClient,
  userId: string,
  tool: ToolRunTool,
  limit = 20
): Promise<ToolRunSummary[]> {
  try {
    const { data } = await supabase
      .from('tool_runs')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .eq('tool', tool)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as ToolRunSummary[]) ?? [];
  } catch {
    return [];
  }
}
