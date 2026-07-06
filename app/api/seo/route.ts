// SEO & AEO advisor: fetch the user's website, extract on-page signals, and ask
// GPT-4o for concrete SEO (search) + AEO (answer-engine / AI) improvement tips.
// Uses the OpenAI key already configured for the rest of the app.
import { NextRequest, NextResponse } from 'next/server';
import { normalizeUrl, BrandExtractError } from '@/lib/brand/extract';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { isPlatform, platformLabel } from '@/lib/seo/platforms';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';
import { saveMemory } from '@/lib/memory/store';
import { getPersonaContext } from '@/lib/personalization/context';
import { saveToolRun } from '@/lib/toolRuns/store';
import { scoreSignals, auditToPromptBlock } from '@/lib/seo/audit';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface SeoTip {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  steps: string[];
  /**
   * Optional ready-to-paste artifact (e.g. JSON-LD, an llms.txt file, an FAQ
   * block). This is what makes AEO advice actionable instead of abstract —
   * the speaker copies it straight onto their site.
   */
  code?: string;
  /** Language hint for the code block, e.g. "json", "html", "text". */
  codeLang?: string;
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

async function fetchHtml(url: string): Promise<{ html: string; xRobotsTag: string }> {
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
    return {
      html: new TextDecoder('utf-8').decode(buf.slice(0, MAX_HTML_BYTES)),
      // X-Robots-Tag can noindex a page from the HTTP layer even when the HTML
      // looks fine — capture it so we can report true indexability.
      xRobotsTag: res.headers.get('x-robots-tag') ?? '',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check robots.txt for whether the site declares a sitemap. Best-effort and
 * bounded — a missing/blocked robots.txt just means "unknown", not an error.
 */
async function fetchRobotsInfo(origin: string): Promise<{ hasRobotsTxt: boolean; declaresSitemap: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${origin}/robots.txt`, { redirect: 'follow', signal: controller.signal });
    if (!res.ok) return { hasRobotsTxt: false, declaresSitemap: false };
    const text = (await res.text()).slice(0, 50_000);
    return { hasRobotsTxt: true, declaresSitemap: /^\s*sitemap\s*:/im.test(text) };
  } catch {
    return { hasRobotsTxt: false, declaresSitemap: false };
  } finally {
    clearTimeout(timer);
  }
}

// Social / professional profiles worth citing as schema.org sameAs and as
// E-E-A-T signals. We just note which ones the page already links out to.
const SOCIAL_HOSTS: Record<string, string> = {
  'linkedin.com': 'LinkedIn',
  'twitter.com': 'X/Twitter',
  'x.com': 'X/Twitter',
  'youtube.com': 'YouTube',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok',
  'wikipedia.org': 'Wikipedia',
  'medium.com': 'Medium',
  'substack.com': 'Substack',
};

function headingTexts(html: string, tag: string): string[] {
  return Array.from(html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')))
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isQuestion(s: string): boolean {
  return /\?\s*$/.test(s) || /^(who|what|why|how|when|where|which|can|do|does|is|are|should|will)\b/i.test(s);
}

function extractSignals(html: string, xRobotsTag: string, robots: { hasRobotsTxt: boolean; declaresSitemap: boolean }) {
  const pick = (re: RegExp) => (html.match(re)?.[1] ?? '').trim();
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Collect all JSON-LD @type values (handles arrays and @graph nesting loosely).
  const jsonLdBlocks = Array.from(
    html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
  ).map((m) => m[1] ?? '');
  const jsonLdTypes = Array.from(
    jsonLdBlocks.join(' ').matchAll(/"@type"\s*:\s*"([^"]+)"/gi)
  )
    .map((m) => m[1])
    .filter(Boolean);
  const jsonLdBlob = jsonLdBlocks.join(' ').toLowerCase();

  const metaRobots = pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const robotsDirective = [metaRobots, xRobotsTag].filter(Boolean).join(' | ');
  const indexable = !/noindex/i.test(metaRobots) && !/noindex/i.test(xRobotsTag);

  const h1s = headingTexts(html, 'h1');
  const h2s = headingTexts(html, 'h2');
  const h3s = headingTexts(html, 'h3');
  const questionHeadings = [...h1s, ...h2s, ...h3s].filter(isQuestion).slice(0, 12);

  // Which social / professional profiles the page links out to (sameAs fodder).
  const socialProfiles = Array.from(
    new Set(
      Array.from(html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi))
        .map((m) => m[1])
        .map((href) => {
          const host = Object.keys(SOCIAL_HOSTS).find((h) => href.includes(h));
          return host ? SOCIAL_HOSTS[host] : '';
        })
        .filter(Boolean)
    )
  );

  return {
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    // True indexability, resolved from meta robots AND the X-Robots-Tag header —
    // so tips never wrongly tell a speaker to "enable indexing" when it's already on.
    indexable,
    robotsDirective,
    canonical: pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    htmlLang: pick(/<html[^>]+lang=["']([^"']*)["']/i),
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    ogTitle: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i),
    ogDescription: pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i),
    ogImage: pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i),
    twitterCard: pick(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']*)["']/i),
    h1Count: h1s.length,
    firstH1: h1s[0] ?? '',
    h2Count: h2s.length,
    h2Samples: h2s.slice(0, 8),
    questionHeadings,
    imgCount: count(/<img[\s>]/gi),
    imgMissingAlt: count(/<img(?:(?!alt=)[^>])*?>/gi),
    jsonLdTypes,
    // Concrete schema flags so the model refines what exists instead of
    // re-recommending it from scratch.
    hasFaqSchema: /faqpage|"question"/i.test(jsonLdBlob),
    hasPersonSchema: /"@type"\s*:\s*"person"/i.test(jsonLdBlob),
    hasOrganizationSchema: /organization/i.test(jsonLdBlob),
    hasSpeakableSchema: /speakable/i.test(jsonLdBlob),
    socialProfiles,
    hasRobotsTxt: robots.hasRobotsTxt,
    declaresSitemap: robots.declaresSitemap,
    wordCount: text ? text.split(' ').length : 0,
    textSample: text.slice(0, 1100),
  };
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

  if (!hasAiKey()) {
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

  const origin = new URL(url).origin;
  let html: string;
  let xRobotsTag = '';
  let robots = { hasRobotsTxt: false, declaresSitemap: false };
  try {
    // Fetch the page and its robots.txt together so indexability + sitemap
    // status are grounded in fact, not guessed.
    const [page, robotsInfo] = await Promise.all([fetchHtml(url), fetchRobotsInfo(origin)]);
    html = page.html;
    xRobotsTag = page.xRobotsTag;
    robots = robotsInfo;
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach that website. Check the address and try again." },
      { status: 502 }
    );
  }

  const signals = extractSignals(html, xRobotsTag, robots);

  // Spell out what the page ALREADY does well so the model can't "recommend"
  // fixing something that's already in place — the top complaint about generic
  // SEO tools (telling you to enable indexing when it's on, add an H1 that exists).
  const alreadyGood: string[] = [];
  if (signals.indexable) alreadyGood.push('The page is indexable (no noindex in meta robots or the X-Robots-Tag header) — do NOT suggest enabling indexing.');
  if (signals.h1Count >= 1) alreadyGood.push(`There is already an H1 ("${signals.firstH1 || 'present'}") — do NOT suggest adding an H1; only suggest rewording it if genuinely weak.`);
  if (signals.metaDescription) alreadyGood.push('A meta description already exists — only suggest tightening it, not adding one.');
  if (signals.canonical) alreadyGood.push('A canonical tag is present — do NOT suggest adding one.');
  if (signals.hasViewport) alreadyGood.push('A responsive viewport meta tag is present — do NOT flag mobile-friendliness on that basis.');
  if (signals.declaresSitemap) alreadyGood.push('robots.txt already declares a sitemap — do NOT suggest creating/submitting a sitemap from scratch.');
  if (signals.hasFaqSchema) alreadyGood.push('FAQ schema (FAQPage/Question) is already present — do NOT suggest adding FAQ schema; suggest expanding the questions instead.');
  if (signals.hasPersonSchema) alreadyGood.push('Person schema is already present — refine it (add sameAs, jobTitle, knowsAbout) rather than adding it fresh.');
  if (signals.jsonLdTypes.length) alreadyGood.push(`Structured data already present: ${signals.jsonLdTypes.join(', ')}.`);

  // Personalization: fold in who this speaker actually is — their Brand Kit
  // (name, signature topics, bio, voice) plus any remembered facts — so tips are
  // tailored to THEM, not just their HTML. Empty only when we truly know nothing.
  const personaBlock = await getPersonaContext(supabase, user.id);
  const memoryBlock = personaBlock ? `\n\n${personaBlock}` : '';

  // Run the concrete, scored audit on the scraped signals. It gives the user a
  // real "what we found" panel AND anchors the AI tips to the same verified
  // findings so the advice can't read as random.
  const audit = scoreSignals(signals as Record<string, unknown>);
  const auditBlock = auditToPromptBlock(audit);

  const prompt = `You are a senior SEO + AEO/GEO strategist advising a PUBLIC SPEAKER on their website. AEO/GEO = getting cited and recommended by AI answer engines (ChatGPT, Perplexity, Google AI Overviews, Gemini). The speaker's goal is to get booked — so "found by an event organizer or an AI that an organizer asks" matters as much as classic Google ranking.

ON-PAGE SIGNALS scraped from ${url}:
${JSON.stringify(signals, null, 2)}

WHAT THIS PAGE ALREADY DOES WELL — you MUST NOT recommend adding or enabling any of these; treat them as done:
${alreadyGood.length ? alreadyGood.map((s) => `- ${s}`).join('\n') : '- (nothing detected as already in place)'}${memoryBlock}${auditBlock ? `\n\n${auditBlock}` : ''}

HARD RULES:
- Never recommend something the signals show already exists. If you're not sure from the data, don't assume it's missing.
- Every tip must reference THIS page's actual data (its real title, headings, word count, schema types, question headings, linked profiles). No boilerplate that would read the same for any website.
- Be specific to a speaker: their bio/credentials (E-E-A-T), their talk topics as entities, the exact questions an event organizer or attendee would ask an AI ("who is a good keynote speaker on X?").
- If we know who this speaker is (the "WHO THIS SPEAKER IS" block above), personalize hard: target their actual talk topics as keywords/entities, pre-fill schema (name, jobTitle, knowsAbout) with what we know, quote their real bio/voice, and prioritize the fixes that best serve their goals. Do NOT give advice that ignores who they are.

The site is built with: ${platformLabel(platform)}. Every "steps" instruction MUST be written for ${platformLabel(platform)} specifically — its real menus/panels/where to paste code (Wix: Settings → SEO + the Custom Code / embed panel; WordPress: an SEO plugin like Yoast/RankMath or a custom-HTML block; Squarespace/Webflow/Shopify: page settings + code injection; "Custom code / HTML": edit the actual <head> and markup). Do not give steps for a different platform.

For SEO (classic search): give 3–5 of the highest-leverage fixes for THIS page (e.g. a weak/missing title or meta description using the real current values, thin content if wordCount is low, heading structure, image alt if imgMissingAlt is high, internal linking).

For AEO/GEO: this is where speakers win and where generic tools fail. Go BEYOND "add an FAQ." Give 3–5 concrete, higher-leverage tactics such as:
- A Person + speakable JSON-LD block that makes the speaker a machine-readable entity (name, jobTitle, knowsAbout = their topics, sameAs = their real linked profiles${signals.socialProfiles.length ? ` — detected: ${signals.socialProfiles.join(', ')}` : ''}).
- Question-shaped headings that mirror what people literally ask AI, each answered in a tight 40–60 word "quotable" paragraph the model can lift.
- An FAQPage (or expanded FAQ) targeting booking-intent questions ("How much does {name} charge to speak?", "What does {name} speak about?").
- An llms.txt / AI-readable summary file, and clear authorship/credibility signals.
When a tip is about adding markup or a file, include a ready-to-paste artifact in "code" (real JSON-LD / HTML / text, pre-filled with this speaker's actual name, URL ${url}, and detected topics/profiles where possible) and set "codeLang" to "json", "html", or "text". Use placeholders like [Your headshot URL] only where you truly can't infer the value.

Every tip MUST include "steps": 3–5 short, concrete, do-this-now instructions in plain language for ${platformLabel(platform)}.

Respond with ONLY valid JSON in this exact shape:
{
  "summary": "two or three sentences: how discoverable this page is today for a speaker, and the single biggest opportunity",
  "seo": [{ "title": "short tip", "detail": "why it matters for THIS page", "severity": "high" | "medium" | "low", "steps": ["step 1", "step 2", "step 3"] }],
  "aeo": [{ "title": "short tip", "detail": "why it matters for getting cited by AI", "severity": "high" | "medium" | "low", "steps": ["step 1", "step 2", "step 3"], "code": "ready-to-paste artifact when relevant, else omit", "codeLang": "json|html|text when code is present" }]
}
Aim for 3–5 items in each array. No markdown, no code fences around the whole response.`;

  let report: { summary: string; seo: SeoTip[]; aeo: SeoTip[] };
  try {
    const completion = await createChatCompletion('gpt-4o', {
      // Higher than before: AEO tips now carry ready-to-paste JSON-LD/HTML
      // artifacts, which are token-heavy, so the JSON mustn't truncate.
      max_tokens: 4000,
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

  // Remember this speaker's website so future SEO tips — and every other AI tool
  // that reads memory — stay personal to them. Auto-captured, deduped, non-fatal.
  await saveMemory(supabase, user.id, `Their speaker website is ${url}.`, {
    category: 'fact',
    source: 'auto',
  });

  // Persist the run so the tips survive leaving/returning and are on every device.
  await saveToolRun(supabase, user.id, {
    tool: 'seo',
    title: url,
    input: { url, platform },
    output: { url, signals, report, plan, platform, audit },
  });

  return NextResponse.json({ url, signals, report, plan, platform, audit });
}
