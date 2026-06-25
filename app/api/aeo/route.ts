import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserBilling } from '@/lib/billing/server';
import { generateAeoContent } from '@/lib/openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Generate AEO/SEO content for a talk. Gated to Full Premium — Core Premium and
 * Free users get a 403 with an upgrade prompt.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const billing = await getUserBilling(supabase, user.id);
  if (!billing.planConfig.aeoSeo) {
    return NextResponse.json(
      {
        error: 'The AEO/SEO tool is available on Full Premium.',
        code: 'requires_full',
        upgrade: true,
      },
      { status: 403 }
    );
  }

  let body: { talkTitle?: string; topic?: string; speakerName?: string; audience?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const talkTitle = body.talkTitle?.trim();
  const topic = body.topic?.trim();
  if (!talkTitle || !topic) {
    return NextResponse.json({ error: 'talkTitle and topic are required.' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured (OPENAI_API_KEY).' }, { status: 503 });
  }

  try {
    const result = await generateAeoContent({
      speakerName: body.speakerName?.trim() || 'the speaker',
      talkTitle,
      topic,
      audience: body.audience?.trim(),
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate AEO/SEO content';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
