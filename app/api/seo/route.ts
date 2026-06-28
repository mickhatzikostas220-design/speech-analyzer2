// SEO & AEO advisor: fetch the user's website, extract on-page signals, and ask
// Claude for concrete SEO (search) + AEO (answer-engine / AI) improvement tips.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeUrl, BrandExtractError } from '@/lib/brand/extract';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

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

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'The SEO tool is not configured yet.' }, { status: 503 });
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

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

Respond with ONLY valid JSON in this exact shape:
{
  "summary": "one or two sentence overall read on the page",
  "seo": [{ "title": "short tip", "detail": "one or two sentences", "severity": "high" | "medium" | "low" }],
  "aeo": [{ "title": "short tip", "detail": "one or two sentences", "severity": "high" | "medium" | "low" }]
}
Aim for 3–5 items in each array. No markdown, no code fences.`;

  let report: { summary: string; seo: unknown[]; aeo: unknown[] };
  try {
    const msg = await anthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      messages: [{ role: 'user', content: prompt }],
    });
    const textPart = msg.content.find((c) => c.type === 'text');
    const raw = (textPart && 'text' in textPart ? textPart.text : '').trim();
    const json = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    report = JSON.parse(json);
  } catch (err) {
    console.error('SEO analysis failed:', err);
    return NextResponse.json(
      { error: 'Could not analyze that page right now. Please try again.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ url, signals, report });
}
