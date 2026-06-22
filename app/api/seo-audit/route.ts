import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { auditUrl, SeoAuditError, type AuditResult } from '@/lib/seo/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SeoTip {
  area: 'seo' | 'aeo' | 'both';
  priority: 'high' | 'medium' | 'low';
  title: string;
  why: string;
  how: string;
}

/**
 * POST /api/seo-audit  { url }
 * Fetches the page, runs deterministic SEO/AEO checks, then asks GPT-4o to
 * turn the findings into a short, prioritized list of plain-English tips.
 * The deterministic checks always come back even if the AI layer is skipped.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You need to be signed in.' }, { status: 401 });

  let url = '';
  try {
    url = (await req.json())?.url ?? '';
  } catch {
    /* validated below */
  }

  let audit: AuditResult;
  try {
    audit = await auditUrl(url);
  } catch (err) {
    if (err instanceof SeoAuditError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[seo-audit] unexpected error', err);
    return NextResponse.json({ error: 'Something went wrong reading that site. Try again.' }, { status: 500 });
  }

  const tips = await generateTips(audit);
  return NextResponse.json({ audit, tips });
}

async function generateTips(audit: AuditResult): Promise<SeoTip[]> {
  if (!process.env.OPENAI_API_KEY) return [];

  const { signals, checks } = audit;
  const findings = checks
    .map((c) => `- [${c.area.toUpperCase()} / ${c.status}] ${c.title}: ${c.detail}`)
    .join('\n');

  const context = [
    `URL: ${audit.finalUrl}`,
    `Title: ${signals.title ?? '(none)'}`,
    `Meta description: ${signals.metaDescription ?? '(none)'}`,
    `H1(s): ${signals.h1Text.join(' | ') || '(none)'}`,
    `Heading outline: ${signals.headingOutline.map((h) => `H${h.level}:${h.text}`).slice(0, 15).join(' / ') || '(none)'}`,
    `Schema types: ${signals.jsonLdTypes.join(', ') || '(none)'}`,
    `Question headings: ${signals.questionHeadings.join(' | ') || '(none)'}`,
    `Word count: ~${signals.wordCount}`,
  ].join('\n');

  const systemPrompt = `You are a senior SEO and AEO (Answer Engine Optimization) consultant.
SEO = ranking in traditional search results (Google, Bing).
AEO = being cited and quoted by AI answer engines (ChatGPT, Perplexity, Google AI Overviews, Claude).

You are given an automated audit of a single web page: its on-page signals and a list of pass/warn/fail findings. Turn this into a prioritized, specific, actionable set of improvement tips.

Rules:
- Only return tips that are clearly justified by the findings/context. Do NOT invent problems that the data does not support.
- Be concrete and specific to THIS page — reference its actual title, headings, or missing elements. No generic filler.
- Prioritize: high = directly hurts ranking or AI-citability now; medium = meaningful gain; low = nice polish.
- Cover BOTH traditional SEO and AEO. Tag each tip's area accordingly.
- Return 5–8 tips, most impactful first.

Respond with ONLY valid JSON of this exact shape:
{"tips":[{"area":"seo|aeo|both","priority":"high|medium|low","title":"short imperative title","why":"one sentence on impact","how":"one or two sentences of concrete steps"}]}`;

  const userPrompt = `Audit context:
${context}

Findings:
${findings}

SEO score: ${audit.seoScore}/100. AEO score: ${audit.aeoScore}/100.

Write the prioritized improvement tips now as JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1400,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    const tips: SeoTip[] = Array.isArray(parsed?.tips) ? parsed.tips : [];
    return tips
      .filter((t) => t && t.title && t.how)
      .map((t) => ({
        area: ['seo', 'aeo', 'both'].includes(t.area) ? t.area : 'seo',
        priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
        title: String(t.title),
        why: String(t.why ?? ''),
        how: String(t.how),
      }));
  } catch (err) {
    console.error('[seo-audit] tip generation failed', err);
    return [];
  }
}
