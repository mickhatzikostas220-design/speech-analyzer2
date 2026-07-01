// SEO/GEO/AEO chat assistant for the SEO tool. A premium-only chatbot that sits
// at the bottom of the SEO page and answers questions about the user's website
// and how to rank in search (SEO), AI/generative engines (GEO), and answer
// engines (AEO). Its behaviour is modeled on the open SEO-GEO-AEO audit skill
// (github.com/SNLabat/SEO-GEO-AEO-Skill): the methodology below is baked into the
// system prompt so the bot reasons like that skill.
//
// Locked behind a paid plan: free users get a 403 from POST and `unlocked:false`
// from GET, matching the gating already used elsewhere on the SEO page.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';

export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SiteContext {
  url?: string;
  signals?: Record<string, unknown>;
  report?: { summary?: string; seo?: unknown[]; aeo?: unknown[] };
}

// The audit methodology from the SEO-GEO-AEO skill, distilled into a system
// prompt. This is what gives the chatbot "the skill" — its persona, the three
// dimensions it reasons across, and the principles it follows.
const SKILL_PROMPT = `You are the SEO/GEO/AEO audit assistant for Speech Analyzer, helping a public speaker make their website easy to find — on search engines, in AI assistants, and in answer engines. You follow the SEO/GEO/AEO audit methodology.

You reason across three dimensions:
- SEO (traditional search — Google, Bing): title tags, meta descriptions, heading hierarchy, URL structure, image alt text, content quality and depth, internal linking, valid schema markup.
- GEO (generative engine optimization — Perplexity, ChatGPT Search, Gemini, AI Overviews): E-E-A-T signals, author credentials and bio, factual density, organizational/entity clarity, original perspectives and quotable expertise so AI systems cite the site.
- AEO (answer engine optimization — featured snippets, voice search): question-phrased headings, concise structured answers, FAQ and HowTo schema, conversational language.

How you work:
1. Be specific. Reference the actual website data you've been given (titles, meta, headings, word count, schema types) instead of generic advice. Never assume a site has or lacks something you can see in the data.
2. When you score, use a 1-10 scale per dimension (green 8-10, amber 5-7, red 1-4) and explain why.
3. Prioritize. Lead with the highest-impact fixes and say why they matter for a speaker who wants to get booked.
4. Give do-this-now steps in plain language a non-technical speaker can follow.
5. Acknowledge limits: external signals like Core Web Vitals or backlinks need dedicated tools, so flag those rather than guessing.
6. Match urgency to the actual findings — don't alarm over minor issues.

Keep answers concise, friendly, and actionable. Use short paragraphs or tight bullet lists. Don't dump everything back at the user — answer the question they asked.`;

function buildSystemPrompt(context: SiteContext | undefined): string {
  if (!context?.url) {
    return `${SKILL_PROMPT}

The speaker hasn't scanned a website in this session yet. If they ask about a specific site, suggest they run a scan above first (paste their URL and click "Get tips") so you can reference real on-page data, but you can still answer general SEO/GEO/AEO questions.`;
  }

  const parts = [`The speaker is asking about this website: ${context.url}`];
  if (context.signals) {
    parts.push(`On-page signals scraped from the site:\n${JSON.stringify(context.signals, null, 2)}`);
  }
  if (context.report?.summary) {
    parts.push(`Earlier scan summary: ${context.report.summary}`);
  }
  return `${SKILL_PROMPT}

${parts.join('\n\n')}

Ground your answers in this site's actual data wherever you can.`;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const plan = await getUserPlan(supabase);
  return NextResponse.json({ plan, unlocked: plan !== 'free' });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // Locked feature: only paid plans can use the assistant.
  const plan = await getUserPlan(supabase);
  if (plan === 'free') {
    return NextResponse.json(
      { error: 'The SEO assistant is a premium feature. Upgrade to chat about your website.' },
      { status: 403 }
    );
  }

  const limit = rateLimit(`seo-chat:${clientIp(request)}`, 30, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many messages. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  if (!hasAiKey()) {
    return NextResponse.json({ error: 'The SEO assistant is not configured yet.' }, { status: 503 });
  }

  let body: { messages?: unknown; context?: SiteContext };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'No message provided.' }, { status: 400 });
  }
  // Cap history so a long chat can't blow the context window / cost.
  const trimmed = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12);

  let stream: Awaited<ReturnType<typeof createChatCompletion>>;
  try {
    stream = await createChatCompletion('gpt-4o', {
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(body.context) },
        ...trimmed,
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI request failed.';
    console.error('SEO chat stream error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) controller.enqueue(encoder.encode(text));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
