import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Premium tools gated behind the free daily limit. Key = usage row; value = label.
// Assistant is intentionally excluded — it runs on each user's own API key.
export const TOOLS = {
  analyze: 'Speech Analyzer',
  compare: 'Compare',
  clipflow: 'ClipFlow',
  studio: 'Studio',
} as const;
export type Tool = keyof typeof TOOLS;

export const FREE_DAILY_LIMIT = 3;
export const UPGRADE_URL = '/settings/billing';

type Credit =
  | { allowed: true; pro: boolean }
  | { allowed: false; pro: false; count: number; limit: number };

// One atomic check+increment via the SQL function. Pro users pass freely; free
// users get FREE_DAILY_LIMIT uses of each tool per day. Fails open on infra
// error — a DB hiccup shouldn't block a (possibly paying) user.
async function consume(userId: string, tool: Tool): Promise<Credit> {
  const { data, error } = await createAdminClient().rpc('consume_tool_credit', {
    p_user: userId,
    p_tool: tool,
    p_limit: FREE_DAILY_LIMIT,
  });
  if (error || !data) {
    console.error('consume_tool_credit failed', error);
    return { allowed: true, pro: false };
  }
  return data as Credit;
}

// Gate a route: returns a 402 response when the free limit is hit, else null.
export async function enforceToolLimit(userId: string, tool: Tool): Promise<NextResponse | null> {
  const r = await consume(userId, tool);
  if (r.allowed) return null;
  return NextResponse.json(
    {
      error: `Daily free limit reached for ${TOOLS[tool]} (${FREE_DAILY_LIMIT}/day). Upgrade to Pro for unlimited use.`,
      code: 'limit_reached',
      upgradeUrl: UPGRADE_URL,
    },
    { status: 402 }
  );
}
