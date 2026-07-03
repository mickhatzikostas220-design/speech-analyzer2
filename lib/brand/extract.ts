import type { BrandKit } from './types';
import { cloneDefaultBrand } from './defaults';
import { normalizeHex, isNeutral, saturation, readableTextOn, hexToRgb } from './color';
import { safeFetchHtml, SafeFetchError } from '@/lib/safeFetch';

/**
 * Auto-extract a brand kit from a speaker's website. Pure server-side:
 * fetches the page HTML and scrapes brand signals (theme color, brand
 * CSS variables, logo / favicon, web fonts, og:image, description).
 *
 * No third-party services and no extra dependencies — just `fetch` +
 * regex over the markup. It is best-effort: anything it can't find
 * falls back to the default (Hatzikostas) kit, and total failure throws
 * a BrandExtractError the caller can surface cleanly.
 */
export class BrandExtractError extends Error {}

const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 800_000;

export function normalizeUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) throw new BrandExtractError('Enter a website address.');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) throw new Error('no tld');
    return u.toString();
  } catch {
    throw new BrandExtractError("That doesn't look like a valid website address.");
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  // SSRF protection (DNS resolution + per-redirect-hop host checks) is shared
  // with the SEO scraper — see lib/safeFetch.ts.
  try {
    return await safeFetchHtml(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      throw new BrandExtractError(
        "Couldn't reach that website. Check the address, or set your brand by hand."
      );
    }
    throw new BrandExtractError(
      "Couldn't reach that website. Check the address, or set your brand by hand."
    );
  }
}

// --- tiny HTML helpers -------------------------------------------------

function metaContent(html: string, key: string): string | undefined {
  // matches <meta name|property="key" content="...">  (either attr order)
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${key}["']`, 'i'),
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
    .replace(/&nbsp;/g, ' ');
}

function abs(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

// --- color extraction --------------------------------------------------

function collectHexes(text: string): string[] {
  const out: string[] = [];
  const hexRe = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(text))) {
    let h = m[1];
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length === 4) h = h.slice(0, 3);
    const norm = normalizeHex(`#${h}`);
    if (norm) out.push(norm);
  }
  const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
  while ((m = rgbRe.exec(text))) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if ([r, g, b].every((n) => n <= 255)) {
      out.push(
        `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
      );
    }
  }
  return out;
}

function pickBrandColors(html: string, themeColor?: string): { signature?: string; accent?: string } {
  const score = new Map<string, number>();
  const bump = (hex: string, weight: number) => {
    const n = normalizeHex(hex);
    if (!n || isNeutral(n)) return;
    score.set(n, (score.get(n) ?? 0) + weight);
  };

  // 1) Brand-y CSS custom properties get the strongest weight.
  const varRe =
    /--[a-z0-9-]*(?:primary|brand|accent|theme|main|secondary|highlight|color)[a-z0-9-]*\s*:\s*([^;{}]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(html))) {
    for (const hex of collectHexes(m[1])) bump(hex, 6);
  }

  // 2) theme-color meta is a deliberate brand signal.
  if (themeColor) bump(themeColor, 8);

  // 3) Everything else in <style> blocks + inline styles, by frequency.
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi)?.join(' ') ?? '';
  const inlineStyles = html.match(/style=["'][^"']*["']/gi)?.join(' ') ?? '';
  for (const hex of collectHexes(styleBlocks + ' ' + inlineStyles)) bump(hex, 1);

  if (score.size === 0) return {};

  const ranked = Array.from(score.entries())
    .map(([hex, count]) => ({ hex, weight: count * (0.4 + saturation(hex)) }))
    .sort((a, b) => b.weight - a.weight);

  const signature = ranked[0]?.hex;
  // accent = highest-ranked color that's visibly different from signature.
  const accent = ranked.find((c) => signature && colorDistance(c.hex, signature) > 90)?.hex;
  return { signature, accent };
}

function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.sqrt((x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2);
}

// --- logo / icon / fonts ----------------------------------------------

function findLogo(html: string, base: string): { imageUrl?: string; markUrl?: string } {
  // Best square icon for the top-bar mark.
  const iconCandidates: { href: string; size: number }[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    const rel = (tag.match(/rel=["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    if (!/icon/.test(rel)) continue;
    const href = abs(tag.match(/href=["']([^"']+)["']/i)?.[1], base);
    if (!href) continue;
    const sizeAttr = tag.match(/sizes=["'](\d+)x\d+["']/i)?.[1];
    let size = sizeAttr ? Number(sizeAttr) : rel.includes('apple') ? 152 : 32;
    iconCandidates.push({ href, size });
  }
  iconCandidates.sort((a, b) => b.size - a.size);
  const markUrl = iconCandidates[0]?.href;

  // A real <img> logo, if the page exposes one (alt/class/src mentions "logo").
  let imageUrl: string | undefined;
  const imgRe = /<img\b[^>]*>/gi;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    if (!/logo/i.test(tag)) continue;
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1];
    const resolved = abs(src, base);
    if (resolved && !/^data:/i.test(resolved)) {
      imageUrl = resolved;
      break;
    }
  }

  return { imageUrl, markUrl };
}

function findFonts(html: string): { display?: string; body?: string; cssHref?: string } {
  // Google Fonts <link> is the most reliable, machine-readable signal.
  const gf = html.match(
    /<link\b[^>]*href=["'](https:\/\/fonts\.googleapis\.com\/css[^"']+)["'][^>]*>/i
  );
  if (gf) {
    const href = decodeEntities(gf[1]);
    const family = href.match(/family=([^:&]+)/i)?.[1];
    if (family) {
      const name = decodeURIComponent(family.replace(/\+/g, ' ')).split(',')[0].trim();
      const stack = `'${name}', system-ui, sans-serif`;
      return { display: stack, body: stack, cssHref: ensureFontDisplay(href) };
    }
    return { cssHref: ensureFontDisplay(href) };
  }
  // Adobe Fonts / Typekit — load the sheet even though we can't name the family.
  const tk = html.match(/<link\b[^>]*href=["'](https:\/\/use\.typekit\.net\/[^"']+)["']/i);
  if (tk) return { cssHref: decodeEntities(tk[1]) };
  return {};
}

function ensureFontDisplay(href: string): string {
  return /display=/.test(href) ? href : `${href}${href.includes('?') ? '&' : '?'}display=swap`;
}

function cleanName(raw: string | undefined, host: string): string {
  if (!raw) return prettifyHost(host);
  // Site titles are usually "Name | Tagline" or "Name - Tagline".
  let name = raw.split(/\s[|\-–—:]\s/)[0].trim();
  name = name.replace(/^(home|welcome to)\b[\s:–-]*/i, '').trim();
  if (!name || name.length > 40) return prettifyHost(host);
  return name;
}

function prettifyHost(host: string): string {
  const core = host.replace(/^www\./, '').split('.')[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}

// --- main --------------------------------------------------------------

export async function extractBrandFromUrl(rawUrl: string): Promise<BrandKit> {
  const url = normalizeUrl(rawUrl);
  const { html, finalUrl } = await fetchHtml(url);
  return parseBrandFromHtml(html, finalUrl);
}

/**
 * Parse a brand kit out of already-fetched HTML. Split out from the
 * network fetch so it can be unit-tested deterministically.
 */
export function parseBrandFromHtml(html: string, finalUrl: string): BrandKit {
  const host = new URL(finalUrl).hostname;

  const themeColor = metaContent(html, 'theme-color');
  const { signature, accent } = pickBrandColors(html, themeColor);
  const { imageUrl, markUrl } = findLogo(html, finalUrl);
  const fonts = findFonts(html);
  const name = cleanName(
    metaContent(html, 'og:site_name') ||
      metaContent(html, 'og:title') ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1],
    host
  );
  const about =
    metaContent(html, 'og:description') || metaContent(html, 'description') || undefined;
  const hero = metaContent(html, 'og:image');

  const kit = cloneDefaultBrand();
  kit.source = 'extracted';
  kit.sourceUrl = finalUrl;
  kit.extractedAt = new Date().toISOString();
  kit.name = name;

  if (signature) {
    kit.colors.signature = signature;
    kit.colors.onSignature = readableTextOn(signature, kit.colors.ink, kit.colors.paper);
  }
  if (accent) kit.colors.accent = accent;

  if (fonts.display) kit.fonts.display = fonts.display;
  if (fonts.body) kit.fonts.body = fonts.body;
  if (fonts.cssHref) kit.fonts.cssHref = fonts.cssHref;

  if (imageUrl) {
    kit.logo = { type: 'image', imageUrl, markUrl, wordmarkText: name };
  } else {
    kit.logo = { type: 'wordmark', wordmarkText: name, markUrl };
  }

  if (hero) kit.hero = { imageUrl: abs(hero, finalUrl) };
  if (about) kit.voice.about = about.slice(0, 400);

  return kit;
}
