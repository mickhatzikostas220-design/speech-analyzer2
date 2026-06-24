/**
 * SEO + AEO audit. Pure server-side: fetches a page's HTML and scrapes the
 * on-page signals that search engines (SEO) and answer engines / LLMs (AEO)
 * rely on, then runs a set of deterministic rule checks over them.
 *
 * No third-party services and no extra dependencies — just `fetch` + regex
 * over the markup, the same approach as lib/brand/extract.ts. The rule
 * checks are deterministic so the result is stable; an LLM layer (in the API
 * route) turns these signals into prioritized, plain-English tips.
 */

export class SeoAuditError extends Error {}

const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 1_500_000;

export type CheckArea = 'seo' | 'aeo';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface AuditCheck {
  id: string;
  area: CheckArea;
  status: CheckStatus;
  title: string;
  /** Human-readable explanation of what was found and why it matters. */
  detail: string;
}

export interface AuditSignals {
  title?: string;
  titleLength: number;
  metaDescription?: string;
  metaDescriptionLength: number;
  canonical?: string;
  robots?: string;
  hasViewport: boolean;
  lang?: string;
  charset?: string;
  h1Count: number;
  h1Text: string[];
  headingOutline: { level: number; text: string }[];
  questionHeadings: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  jsonLdTypes: string[];
  hasFaqSchema: boolean;
  hasArticleSchema: boolean;
  hasOrgOrPersonSchema: boolean;
  hasBreadcrumbSchema: boolean;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  hasMainLandmark: boolean;
  hasSemanticHtml: boolean;
  hasFavicon: boolean;
  publishedDate?: string;
  modifiedDate?: string;
  hasDateSignal: boolean;
  httpsUrl: boolean;
}

export interface AuditResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  signals: AuditSignals;
  checks: AuditCheck[];
  seoScore: number;
  aeoScore: number;
}

export function normalizeUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) throw new SeoAuditError('Enter a website address to audit.');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) throw new Error('no tld');
    return u.toString();
  } catch {
    throw new SeoAuditError("That doesn't look like a valid website address.");
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
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
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) throw new SeoAuditError(`The site responded with ${res.status}.`);
    const reader = res.body?.getReader();
    if (!reader) return { html: await res.text(), finalUrl: res.url || url };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    reader.cancel().catch(() => {});
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    const html = new TextDecoder('utf-8').decode(out);
    return { html, finalUrl: res.url || url };
  } catch (err) {
    if (err instanceof SeoAuditError) throw err;
    throw new SeoAuditError("Couldn't reach that website. Check the address and try again.");
  } finally {
    clearTimeout(timer);
  }
}

// --- tiny HTML helpers (mirrors lib/brand/extract.ts) ------------------

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1].trim());
  }
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function collectHeadings(html: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = decodeEntities(stripTags(m[2]));
    if (text) out.push({ level: Number(m[1]), text });
    if (out.length > 80) break;
  }
  return out;
}

function collectJsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    // Grab every "@type": "X" (or array) without fully trusting the JSON.
    const typeRe = /"@type"\s*:\s*(?:"([^"]+)"|\[([^\]]+)\])/g;
    let t: RegExpExecArray | null;
    while ((t = typeRe.exec(raw))) {
      if (t[1]) types.push(t[1]);
      if (t[2]) {
        for (const piece of t[2].split(',')) {
          const cleaned = piece.replace(/["']/g, '').trim();
          if (cleaned) types.push(cleaned);
        }
      }
    }
  }
  return Array.from(new Set(types));
}

export function extractSignals(html: string, finalUrl: string): AuditSignals {
  const lower = html.toLowerCase();

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const titleText = title ? decodeEntities(title) : undefined;

  const metaDescription = metaContent(html, 'description');
  const robots = metaContent(html, 'robots');
  const lang = html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1];
  const charset =
    html.match(/<meta[^>]*charset=["']?([\w-]+)/i)?.[1] ||
    (metaContent(html, 'content-type') ? 'declared' : undefined);

  const headings = collectHeadings(html);
  const h1s = headings.filter((h) => h.level === 1).map((h) => h.text);
  const questionHeadings = headings
    .map((h) => h.text)
    .filter((t) => /\?$/.test(t) || /^(how|what|why|when|where|who|which|can|do|does|is|are|should)\b/i.test(t));

  const jsonLdTypes = collectJsonLdTypes(html);
  const typeHas = (re: RegExp) => jsonLdTypes.some((t) => re.test(t));

  // Images + missing alt.
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  let imagesMissingAlt = 0;
  for (const tag of imgTags) {
    const alt = tag.match(/\balt=["']([^"']*)["']/i);
    if (!alt || !alt[1].trim()) imagesMissingAlt++;
  }

  // Links — internal vs external relative to host.
  let internalLinks = 0;
  let externalLinks = 0;
  const host = (() => {
    try {
      return new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const aRe = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;
  let a: RegExpExecArray | null;
  while ((a = aRe.exec(html))) {
    const href = a[1];
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      try {
        const h = new URL(href).hostname.replace(/^www\./, '');
        if (h === host) internalLinks++;
        else externalLinks++;
      } catch {
        /* ignore */
      }
    } else {
      internalLinks++;
    }
  }

  const bodyText = stripTags(html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html);
  const wordCount = bodyText.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;

  const publishedDate =
    metaContent(html, 'article:published_time') ||
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1];
  const modifiedDate =
    metaContent(html, 'article:modified_time') ||
    html.match(/"dateModified"\s*:\s*"([^"]+)"/i)?.[1];

  return {
    title: titleText,
    titleLength: titleText?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    canonical: html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1],
    robots,
    hasViewport: /name=["']viewport["']/i.test(html),
    lang,
    charset,
    h1Count: h1s.length,
    h1Text: h1s,
    headingOutline: headings.slice(0, 40),
    questionHeadings: Array.from(new Set(questionHeadings)).slice(0, 12),
    ogTitle: metaContent(html, 'og:title'),
    ogDescription: metaContent(html, 'og:description'),
    ogImage: metaContent(html, 'og:image'),
    ogType: metaContent(html, 'og:type'),
    twitterCard: metaContent(html, 'twitter:card'),
    jsonLdTypes,
    hasFaqSchema: typeHas(/faq|qapage|question/i),
    hasArticleSchema: typeHas(/article|blogposting|newsarticle/i),
    hasOrgOrPersonSchema: typeHas(/organization|person|localbusiness/i),
    hasBreadcrumbSchema: typeHas(/breadcrumb/i),
    imageCount: imgTags.length,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    wordCount,
    hasMainLandmark: /<main\b/i.test(lower) || /role=["']main["']/i.test(lower),
    hasSemanticHtml: /<(article|section|nav|header|footer)\b/i.test(lower),
    hasFavicon: /rel=["'][^"']*icon[^"']*["']/i.test(html),
    publishedDate,
    modifiedDate,
    hasDateSignal: Boolean(publishedDate || modifiedDate),
    httpsUrl: /^https:/i.test(finalUrl),
  };
}

// --- deterministic rule checks ----------------------------------------

export function runChecks(s: AuditSignals): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const add = (c: AuditCheck) => checks.push(c);

  // ---- SEO ----
  if (!s.title) {
    add({ id: 'title', area: 'seo', status: 'fail', title: 'Missing page title', detail: 'The page has no <title> tag — the single most important on-page SEO element.' });
  } else if (s.titleLength < 30 || s.titleLength > 65) {
    add({ id: 'title', area: 'seo', status: 'warn', title: 'Title length is off', detail: `Your title is ${s.titleLength} characters. Aim for 30–60 so it isn't truncated in search results.` });
  } else {
    add({ id: 'title', area: 'seo', status: 'pass', title: 'Title length looks good', detail: `"${s.title}" (${s.titleLength} chars).` });
  }

  if (!s.metaDescription) {
    add({ id: 'description', area: 'seo', status: 'fail', title: 'No meta description', detail: 'Add a 120–160 character meta description — it becomes your search-result snippet and drives click-through.' });
  } else if (s.metaDescriptionLength < 70 || s.metaDescriptionLength > 165) {
    add({ id: 'description', area: 'seo', status: 'warn', title: 'Meta description length is off', detail: `It's ${s.metaDescriptionLength} characters. Aim for 120–160 so Google shows the whole thing.` });
  } else {
    add({ id: 'description', area: 'seo', status: 'pass', title: 'Meta description looks good', detail: `${s.metaDescriptionLength} characters.` });
  }

  if (s.h1Count === 0) {
    add({ id: 'h1', area: 'seo', status: 'fail', title: 'No H1 heading', detail: 'Every page should have exactly one <h1> that states the main topic.' });
  } else if (s.h1Count > 1) {
    add({ id: 'h1', area: 'seo', status: 'warn', title: `${s.h1Count} H1 headings`, detail: 'Use a single H1 per page and demote the rest to H2/H3 so the topic hierarchy is clear.' });
  } else {
    add({ id: 'h1', area: 'seo', status: 'pass', title: 'Single, clear H1', detail: `"${s.h1Text[0]}".` });
  }

  add(
    s.canonical
      ? { id: 'canonical', area: 'seo', status: 'pass', title: 'Canonical URL set', detail: s.canonical }
      : { id: 'canonical', area: 'seo', status: 'warn', title: 'No canonical URL', detail: 'Add <link rel="canonical"> to avoid duplicate-content dilution across URL variants.' }
  );

  add(
    s.hasViewport
      ? { id: 'viewport', area: 'seo', status: 'pass', title: 'Mobile viewport set', detail: 'Responsive meta viewport is present.' }
      : { id: 'viewport', area: 'seo', status: 'fail', title: 'No mobile viewport', detail: 'Add a viewport meta tag — Google uses mobile-first indexing.' }
  );

  add(
    s.httpsUrl
      ? { id: 'https', area: 'seo', status: 'pass', title: 'Served over HTTPS', detail: 'Secure connection — a confirmed ranking signal.' }
      : { id: 'https', area: 'seo', status: 'fail', title: 'Not served over HTTPS', detail: 'Move to HTTPS; it is a ranking signal and required for trust.' }
  );

  if (/noindex/i.test(s.robots ?? '')) {
    add({ id: 'robots', area: 'seo', status: 'fail', title: 'Page is set to noindex', detail: 'The robots meta tag tells search engines NOT to index this page. Remove "noindex" if you want it found.' });
  }

  add(
    s.lang
      ? { id: 'lang', area: 'seo', status: 'pass', title: 'Language declared', detail: `<html lang="${s.lang}">.` }
      : { id: 'lang', area: 'seo', status: 'warn', title: 'No language attribute', detail: 'Add lang="en" (or your language) to the <html> tag for accessibility and international SEO.' }
  );

  if (s.imageCount > 0) {
    add(
      s.imagesMissingAlt === 0
        ? { id: 'alt', area: 'seo', status: 'pass', title: 'All images have alt text', detail: `${s.imageCount} images, all with alt attributes.` }
        : { id: 'alt', area: 'seo', status: 'warn', title: `${s.imagesMissingAlt} image(s) missing alt text`, detail: `${s.imagesMissingAlt} of ${s.imageCount} images lack alt text — bad for accessibility and image search.` }
    );
  }

  add(
    s.ogTitle && s.ogImage
      ? { id: 'opengraph', area: 'seo', status: 'pass', title: 'Open Graph tags present', detail: 'Shared links will render a rich preview on social platforms.' }
      : { id: 'opengraph', area: 'seo', status: 'warn', title: 'Incomplete Open Graph tags', detail: 'Add og:title, og:description and og:image so shared links look good on social and in chats.' }
  );

  // ---- AEO (Answer Engine Optimization) ----
  if (s.jsonLdTypes.length === 0) {
    add({ id: 'schema', area: 'aeo', status: 'fail', title: 'No structured data (Schema.org)', detail: 'Answer engines and AI assistants rely on JSON-LD to understand your content. Add schema markup for your page type.' });
  } else {
    add({ id: 'schema', area: 'aeo', status: 'pass', title: 'Structured data found', detail: `Schema types: ${s.jsonLdTypes.join(', ')}.` });
  }

  add(
    s.hasFaqSchema
      ? { id: 'faq', area: 'aeo', status: 'pass', title: 'FAQ / Q&A schema present', detail: 'Great — this is prime material for AI answers and rich results.' }
      : { id: 'faq', area: 'aeo', status: 'warn', title: 'No FAQ schema', detail: 'Add an FAQ section with FAQPage schema. Question-and-answer pairs are the format AI answer engines quote most.' }
  );

  add(
    s.questionHeadings.length > 0
      ? { id: 'questions', area: 'aeo', status: 'pass', title: 'Question-based headings found', detail: `e.g. "${s.questionHeadings[0]}". These match how people ask AI assistants.` }
      : { id: 'questions', area: 'aeo', status: 'warn', title: 'No question-style headings', detail: 'Phrase some headings as the questions your audience actually asks, then answer them concisely right below.' }
  );

  add(
    s.hasOrgOrPersonSchema
      ? { id: 'entity', area: 'aeo', status: 'pass', title: 'Organization/Person entity defined', detail: 'Helps AI engines attribute and trust the source (E-E-A-T).' }
      : { id: 'entity', area: 'aeo', status: 'warn', title: 'No Organization/Person schema', detail: 'Add Organization or Person schema so answer engines know who is behind the content — a key trust signal.' }
  );

  add(
    s.hasDateSignal
      ? { id: 'freshness', area: 'aeo', status: 'pass', title: 'Date signals present', detail: 'Published/modified dates help engines judge freshness.' }
      : { id: 'freshness', area: 'aeo', status: 'warn', title: 'No published/updated date', detail: 'Expose a visible and structured publish/update date — answer engines favor content they can date.' }
  );

  add(
    s.hasSemanticHtml && s.hasMainLandmark
      ? { id: 'semantics', area: 'aeo', status: 'pass', title: 'Semantic HTML structure', detail: 'Uses <main> and sectioning elements that machines parse cleanly.' }
      : { id: 'semantics', area: 'aeo', status: 'warn', title: 'Thin semantic structure', detail: 'Wrap content in <main>, <article> and <section> so AI parsers can extract clean, well-scoped passages.' }
  );

  if (s.wordCount < 300) {
    add({ id: 'depth', area: 'aeo', status: 'warn', title: 'Thin content', detail: `Only ~${s.wordCount} words detected. Answer engines pull from substantive, in-depth pages — aim for genuinely complete coverage.` });
  } else {
    add({ id: 'depth', area: 'aeo', status: 'pass', title: 'Substantive content', detail: `~${s.wordCount} words of indexable text.` });
  }

  return checks;
}

function scoreFor(checks: AuditCheck[], area: CheckArea): number {
  const subset = checks.filter((c) => c.area === area);
  if (subset.length === 0) return 100;
  const points = subset.reduce((sum, c) => sum + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  return Math.round((points / subset.length) * 100);
}

export async function auditUrl(rawUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(rawUrl);
  const { html, finalUrl } = await fetchHtml(url);
  const signals = extractSignals(html, finalUrl);
  const checks = runChecks(signals);
  return {
    url,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    signals,
    checks,
    seoScore: scoreFor(checks, 'seo'),
    aeoScore: scoreFor(checks, 'aeo'),
  };
}
