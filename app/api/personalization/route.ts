// Personalization summary API — the read side of "what the AI knows about you".
// Returns the Brand Kit-derived persona (name, website, topics, bio, voice) plus
// a memory count, so the settings screen can show the user exactly what personal
// context every AI tool is drawing on. Read-only; free for all tiers.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPersona } from '@/lib/personalization/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const p = await getPersona(supabase, user.id);
  return NextResponse.json({
    name: p.name,
    websiteUrl: p.websiteUrl,
    topics: p.topics.slice(0, 12),
    bio: p.bio ? p.bio.slice(0, 400) : '',
    tone: p.tone,
    hasAiProfile: Boolean(p.aiProfile),
    memoryCount: p.memoryFacts.length,
    hasAny: p.hasAny,
  });
}
