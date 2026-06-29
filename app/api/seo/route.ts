// SEO & AEO advisor: fetch the user's website, extract on-page signals, and ask
// GPT-4o for concrete SEO (search) + AEO (answer-engine / AI) improvement tips.
// Uses the OpenAI key already configured for the rest of the app.
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { normalizeUrl, BrandExtractError } from '@/lib/brand/extract';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { isPlatform, platformLabel } from '@/lib/seo/platforms';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface SeoTip {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  steps: string[];
}

export const maxDuration = 60;

const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 700_000;

// Block obvious SSRF targets (localhost, link-local, private ranges).
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new BrandExtractError(`The site responded with ${res.status}.`);
    const buf = await res.arrayBuffer();
    return new TextDecoder('utf-8').decode(buf.slice(0, MAX_HTML_BYTES));
  } finally {
    clearTimeout(timer);
  }
}

function extractSignals(html: string) {
  const pick = (re: RegExp) => (html.match(re)?.[1] ?? '').trim();
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const jsonLdTypes = Array.from(
    html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
  )
    .map((m) => (m[1]!.match(/"@type"\s*:\s*"([^"]+)"/)?.[1] ?? ''))
    .filter(Boolean);

  return {
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    metaRobots: pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i),
    canonical: pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    htmlLang: pick(/<html[^>]+lang=["']([^"']*)["']/i),
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    ogTitle: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i),
    ogDescription: pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i),
    ogImage: pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i),
    twitterCard: pick(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']*)["']/i),
    h1Count: count(/<h1[\s>]/gi),
    firstH1: pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '').trim(),
    h2Count: count(/<h2[\s>]/gi),
    imgCount: count(/<img[\s>]/gi),
    imgMissingAlt: count(/<img(?:(?!alt=)[^>])*?>/gi),
    jsonLdTypes,
    wordCount: text ? text.split(' ').length : 0,
  };
}

let _client: OpenAI | null = null;
function openai(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const limit = rateLimit(`seo:${clientIp(request)}`, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'The SEO tool is not configured yet.' }, { status: 503 });
  }

  // Free tier gets one SEO check per week; paid tiers are unlimited.
  const plan = await getUserPlan(supabase);
  const isPaid = plan !== 'free';
  if (!isPaid) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('seo_last_used_at')
      .eq('id', user.id)
      .single();
    const last = (prof as { seo_last_used_at?: string } | null)?.seo_last_used_at;
    if (last && Date.now() - new Date(last).getTime() < WEEK_MS) {
      const days = Math.ceil((WEEK_MS - (Date.now() - new Date(last).getTime())) / 86400000);
      return NextResponse.json(
        {
          error: `You've used your free SEO check this week. Upgrade for unlimited checks and to save fixes to your plan — or come back in ${days} day${days === 1 ? '' : 's'}.`,
        },
        { status: 403 }
      );
    }
  }

  let body: { url?: unknown; platform?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const platform = isPlatform(body.platform) ? body.platform : 'custom';

  let url: string;
  try {
    url = normalizeUrl(typeof body.url === 'string' ? body.url : '');
  } catch (err) {
    const msg = err instanceof BrandExtractError ? err.message : 'Enter a valid website address.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (isBlockedHost(new URL(url).hostname)) {
    return NextResponse.json({ error: 'That address is not allowed.' }, { status: 400 });
  }

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach that website. Check the address and try again." },
      { status: 502 }
    );
  }

  const signals = extractSignals(html);

  const prompt = `You are an SEO and AEO (Answer Engine Optimization) expert advising a public speaker on their website. AEO = being cited by AI assistants and answer engines (ChatGPT, Perplexity, Google AI Overviews).

Here are the on-page signals scraped from ${url}:
${JSON.stringify(signals, null, 2)}

Give specific, actionable tips tailored to THIS page's signals — reference what's missing or weak (e.g. no meta description, thin word count, no structured data). Don't give generic advice that ignores the data.

The website is built with: ${platformLabel(platform)}. Every "steps" instruction MUST be written for ${platformLabel(platform)} specifically — use that platform's real menu names, panels, and where to paste or edit things (e.g. for Wix: Settings → SEO / the SEO panel on each page; for WordPress: an SEO plugin like Yoast or the block editor; for Squarespace/Webflow/Shopify: their page-settings + custom-code areas; for "Custom code / HTML": editing the actual <head>, tags, and markup). Do not give steps for a different platform.

Every tip MUST include "steps": a 3–5 item array of short, concrete, do-this-now instructions (imperative, plain language a non-technical speaker can follow). Reference exact tags/fields/menus where relevant.

Respond with ONLY valid JSON in this exact shape:
{
  "summary": "one or two sentence overall read on the page",
  "seo": [{ "title": "short tip", "detail": "one or two sentences on why it matters", "severity": "high" | "medium" | "low", "steps": ["step 1", "step 2", "step 3"] }],
  "aeo": [{ "title": "short tip", "detail": "one or two sentences on why it matters", "severity": "high" | "medium" | "low", "steps": ["step 1", "step 2", "step 3"] }]
}
Aim for 3–5 items in each array. No markdown, no code fences.`;

  let report: { summary: string; seo: SeoTip[]; aeo: SeoTip[] };
  try {
    const completion = await openai().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2200,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { summary?: string; seo?: SeoTip[]; aeo?: SeoTip[] };
    report = {
      summary: parsed.summary ?? '',
      seo: Array.isArray(parsed.seo) ? parsed.seo : [],
      aeo: Array.isArray(parsed.aeo) ? parsed.aeo : [],
    };
  } catch (err) {
    console.error('SEO analysis failed:', err);
    return NextResponse.json(
      { error: 'Could not analyze that page right now. Please try again.' },
      { status: 502 }
    );
  }

  // Free tier: record the weekly use and return only the single top-priority tip.
  if (!isPaid) {
    await supabase
      .from('profiles')
      .update({ seo_last_used_at: new Date().toISOString() })
      .eq('id', user.id);

    const top = [...report.seo, ...report.aeo].sort(
      (a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
    )[0];
    report = { summary: report.summary, seo: top ? [top] : [], aeo: [] };
  }

  return NextResponse.json({ url, signals, report, plan, platform });
}
