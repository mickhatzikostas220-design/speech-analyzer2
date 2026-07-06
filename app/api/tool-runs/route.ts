// Tool-run history API. Read-only from the client: the tool routes themselves
// save each run server-side (see saveToolRun), and the client fetches here on
// load to restore the latest result and show recent history — so results survive
// navigation and are the same on every device.
//
//   GET /api/tool-runs?tool=seo         -> { latest, history }
//   GET /api/tool-runs?tool=seo&id=<id> -> { run }
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getLatestToolRun,
  getToolRun,
  listToolRuns,
  type ToolRunTool,
} from '@/lib/toolRuns/store';

export const dynamic = 'force-dynamic';

const TOOLS: ToolRunTool[] = ['seo', 'content_ideas', 'stagefinder', 'compare'];
function isTool(v: string | null): v is ToolRunTool {
  return !!v && (TOOLS as string[]).includes(v);
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const url = new URL(request.url);
  const tool = url.searchParams.get('tool');
  if (!isTool(tool)) {
    return NextResponse.json({ error: 'Unknown tool.' }, { status: 400 });
  }

  // Fetch one specific historical run.
  const id = url.searchParams.get('id');
  if (id) {
    const run = await getToolRun(supabase, user.id, id);
    if (!run || run.tool !== tool) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }
    return NextResponse.json({ run });
  }

  // Default: the latest run + a lightweight history list (latest excluded).
  const [latest, history] = await Promise.all([
    getLatestToolRun(supabase, user.id, tool),
    listToolRuns(supabase, user.id, tool, 20),
  ]);
  const trimmedHistory = latest ? history.filter((h) => h.id !== latest.id) : history;

  return NextResponse.json({ latest, history: trimmedHistory });
}
