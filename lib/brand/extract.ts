import type { BrandKit } from './types';
import { cloneDefaultBrand } from './defaults';
import { normalizeHex, isNeutral, saturation, readableTextOn, hexToRgb } from './color';

/**
 * Auto-extract a brand kit from a speaker's website. Pure server-side:
 * fetches the page HTML *and its linked stylesheets*, then scrapes brand
 * signals (theme color, brand CSS variables, button/link colors, logo /
 * favicon, web fonts, og:image, description).
 *
 * Why fetch the stylesheets too: modern site builders (Wix, Squarespace,
 * WordPress themes, Webflow, React SPAs) ship almost no color or font info
 * in the initial HTML — it all lives in external CSS files. Scanning only
 * the HTML found nothing on most real sites and fell back to the default
 * kit, which is why extraction "didn't work." We now pull a handful of the
 * page's stylesheets and scan those too.
 *
 * No third-party services and no extra dependencies — just `fetch` +
 * regex over the markup and CSS. It is best-effort: anything it can't find
 * falls back to the default (Hatzikostas) kit, and total failure throws
 * a BrandExtractError the caller can surface cleanly.
 */
export class BrandExtractError extends Error {}

const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 800_000;
// External CSS budget: how many stylesheets we'll pull and how much of each
// we'll read. Bounded so a site with dozens of huge sheets can't stall us or
// blow memory. Scanned in parallel with a short per-sheet timeout.
const MAX_STYLESHEETS = 6;
const CSS_FETCH_TIMEOUT_MS = 5000;
const MAX_CSS_BYTES_PER_SHEET = 400_000;
const MAX_CSS_BYTES_TOTAL = 1_500_000;

export function normalizeUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) throw new BrandExtractError('Enter a website address.');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    // Only ever speak http(s) — never file:, ftp:, data:, etc.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad scheme');
    if (!u.hostname.includes('.')) throw new Error('no tld');
    // SSRF guard on the PRIMARY fetch target. Previously isBlockedHost was only
    // applied to scraped stylesheet URLs, so a user could point this at an
    // internal address (169.254.169.254, 10.x, 127.0.0.1, an internal hostname
    // with a dot, etc.) and have the server fetch it. Block those here too.
    if (isBlockedHost(u.hostname)) throw new Error('blocked host');
    return u.toString();
  } catch {
    throw new BrandExtractError("That doesn't look like a valid website address.");
  }
}

// Block obvious SSRF targets (localhost, link-local, private ranges). Applied to
// the primary page fetch AND to stylesheet URLs pulled from the page markup.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // A normal browser UA — speakers ask us to read their own public
        // site, and many hosts reject obvious bot agents.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    // Defense-in-depth: a public URL can 302-redirect to an internal address.
    // We follow redirects, so re-check the FINAL host and refuse to read the
    // body if it landed somewhere private.
    try {
      if (isBlockedHost(new URL(res.url || url).hostname)) {
        throw new BrandExtractError('That address is not allowed.');
      }
    } catch (e) {
      if (e instanceof BrandExtractError) throw e;
    }
    if (!res.ok) throw new BrandExtractError(`The site responded with ${res.status}.`);
    const reader = res.body?.getReader();
    if (!reader) return { html: await res.text(), finalUrl: res.url || url };
    // Read at most MAX_HTML_BYTES so a huge page can't stall us.
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
    const html = new TextDecoder('utf-8').decode(concat(chunks));
    return { html, finalUrl: res.url || url };
  } catch (err) {
    if (err instanceof BrandExtractError) throw err;
    throw new BrandExtractError(
      "Couldn't reach that website. Check the address, or set your brand by hand."
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch one text resource (a stylesheet), size- and time-bounded. Never throws. */
async function fetchTextCapped(url: string, maxBytes: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CSS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/css,*/*;q=0.1',
      },
    });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    return new TextDecoder('utf-8').decode(buf.slice(0, maxBytes));
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find the page's linked stylesheets, fetch a handful of them, and return the
 * combined CSS text. Best-effort and bounded; returns '' if none are reachable.
 * We prefer sheets that look like the site's own theme (same host, or a name
 * hinting at "style"/"theme"/"main") and always skip Google Fonts sheets (those
 * carry no color info and are handled separately).
 */
async function fetchStylesheets(html: string, baseUrl: string): Promise<string> {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    const rel = (tag.match(/rel=["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    if (!/stylesheet/.test(rel)) continue;
    const href = abs(tag.match(/href=["']([^"']+)["']/i)?.[1], baseUrl);
    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (/fonts\.googleapis\.com|use\.typekit\.net|fonts\.gstatic\.com/i.test(href)) continue;
    let host: string;
    try {
      host = new URL(href).hostname;
    } catch {
      continue;
    }
    if (isBlockedHost(host)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    hrefs.push(href);
  }

  if (hrefs.length === 0) return '';

  // Rank so we spend our small budget on the most brand-relevant sheets:
  // same-origin theme/main/style sheets first.
  let baseHost = '';
  try {
    baseHost = new URL(baseUrl).hostname;
  } catch {
    /* keep '' */
  }
  const scoreHref = (href: string): number => {
    let score = 0;
    try {
      if (new URL(href).hostname === baseHost) score += 3;
    } catch {
      /* ignore */
    }
    if (/(?:theme|main|style|brand|site|app|global|custom)/i.test(href)) score += 2;
    if (/(?:vendor|bootstrap|normalize|reset|icon|font-awesome|swiper|slick)/i.test(href)) score -= 2;
    return score;
  };
  hrefs.sort((a, b) => scoreHref(b) - scoreHref(a));

  const chosen = hrefs.slice(0, MAX_STYLESHEETS);
  const sheets = await Promise.all(chosen.map((h) => fetchTextCapped(h, MAX_CSS_BYTES_PER_SHEET)));
  return sheets.join('\n').slice(0, MAX_CSS_BYTES_TOTAL);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
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

/**
 * Walk the leaf CSS rules (`selector { decls }`) and bump colors used in
 * brand-defining spots — button/CTA/header/hero backgrounds, link colors —
 * higher than colors seen just anywhere. The regex matches innermost brace
 * pairs, so rules nested in @media still get scanned.
 */
function scanRuleColors(cssText: string, bump: (hex: string, weight: number) => void): void {
  const ruleRe = /([^{}]{1,300})\{([^{}]{1,4000})\}/g;
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = ruleRe.exec(cssText)) && scanned < 4000) {
    scanned++;
    const selector = m[1].toLowerCase();
    const body = m[2];
    const isCta = /\b(?:btn|button|\.cta|\bcta\b|primary|hero|banner|header|navbar|brand)\b|\[type=["']?submit/.test(selector);
    const isLink = /(?:^|,|\s)a[\s.:,>{]|(?:^|,|\s)a$|\blink\b|\bnav\b/.test(selector);
    if (isCta) {
      const bg = body.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1];
      if (bg) for (const hex of collectHexes(bg)) bump(hex, 4);
    }
    if (isLink) {
      const col = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
      if (col) for (const hex of collectHexes(col)) bump(hex, 2);
    }
  }
}

function pickBrandColors(
  html: string,
  cssText: string,
  themeColor?: string
): { signature?: string; accent?: string } {
  const score = new Map<string, number>();
  const bump = (hex: string, weight: number) => {
    const n = normalizeHex(hex);
    if (!n || isNeutral(n)) return;
    score.set(n, (score.get(n) ?? 0) + weight);
  };

  // 1) Brand-y CSS custom properties get the strongest weight — in the HTML
  //    AND in the fetched stylesheets, where most real sites define them.
  const varRe =
    /--[a-z0-9-]*(?:primary|brand|accent|theme|main|secondary|highlight|color)[a-z0-9-]*\s*:\s*([^;{}]+)/gi;
  let m: RegExpExecArray | null;
  const varSource = `${html}\n${cssText}`;
  while ((m = varRe.exec(varSource))) {
    for (const hex of collectHexes(m[1])) bump(hex, 6);
  }

  // 2) theme-color meta is a deliberate brand signal.
  if (themeColor) bump(themeColor, 8);

  // 3) Colors used on buttons / links / headers in the stylesheets.
  scanRuleColors(cssText, bump);

  // 4) Everything else in <style> blocks, inline styles, and external CSS,
  //    by frequency (low weight — saturation breaks ties toward "loud" colors).
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi)?.join(' ') ?? '';
  const inlineStyles = html.match(/style=["'][^"']*["']/gi)?.join(' ') ?? '';
  for (const hex of collectHexes(`${styleBlocks} ${inlineStyles} ${cssText}`)) bump(hex, 1);

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

// Generic / system font-family names that aren't a *brand* font — if a site's
// body font resolves to one of these we keep our default rather than "override"
// with something that isn't really their type.
const SYSTEM_FONTS = new Set(
  [
    'inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'cursive',
    'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', '-apple-system',
    'blinkmacsystemfont', 'segoe ui', 'arial', 'helvetica', 'helvetica neue', 'times',
    'times new roman', 'georgia', 'verdana', 'tahoma', 'trebuchet ms', 'courier',
    'courier new', 'roboto', 'apple color emoji', 'segoe ui emoji', 'noto sans',
  ].map((s) => s.toLowerCase())
);

/** First real font family named in a rule whose selector matches `selRe`. */
function fontFamilyFor(text: string, selRe: RegExp): string | undefined {
  const ruleRe = /([^{}]{1,300})\{([^{}]{1,4000})\}/g;
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = ruleRe.exec(text)) && scanned < 4000) {
    scanned++;
    if (!selRe.test(m[1].toLowerCase())) continue;
    const decl = m[2].match(/font-family\s*:\s*([^;]+)/i)?.[1];
    const fam = decl ? firstFamilyName(decl) : undefined;
    if (fam) return fam;
  }
  return undefined;
}

/** Pull the first usable family name out of a `font-family` value. */
function firstFamilyName(value: string): string | undefined {
  for (const raw of value.split(',')) {
    const name = raw.trim().replace(/^["']|["']$/g, '').trim();
    if (!name || /^var\(/i.test(name)) continue;
    if (SYSTEM_FONTS.has(name.toLowerCase())) return undefined; // system stack → no brand font
    if (!/^[a-z0-9 _-]{2,40}$/i.test(name)) continue; // reject junk / expressions
    return name;
  }
  return undefined;
}

/** Build a loadable Google Fonts stylesheet href for 1–2 family names. */
function googleFontsHref(families: string[]): string {
  const fams = families
    .filter(Boolean)
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700;800`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}

function findFonts(html: string, cssText: string): { display?: string; body?: string; cssHref?: string } {
  const combined = `${html}\n${cssText}`;

  // 1) Google Fonts is the most reliable, machine-readable signal — via a
  //    <link> in the HTML or an @import inside the CSS.
  const gfHref =
    html.match(/<link\b[^>]*href=["'](https:\/\/fonts\.googleapis\.com\/css[^"']+)["'][^>]*>/i)?.[1] ||
    cssText.match(/@import\s+(?:url\()?["']?(https:\/\/fonts\.googleapis\.com\/css[^"')]+)/i)?.[1];
  if (gfHref) {
    const href = decodeEntities(gfHref);
    // A Google Fonts URL can name several families (family=A&family=B). Map the
    // page's real display/body usage onto them where we can.
    const families = Array.from(href.matchAll(/family=([^:&]+)/gi)).map((mm) =>
      decodeURIComponent(mm[1].replace(/\+/g, ' ')).split(',')[0].trim()
    );
    const displayFam = fontFamilyFor(combined, /(?:^|,|\s)h1[\s.,:{]|heading|title|display/) || families[0];
    const bodyFam = fontFamilyFor(combined, /(?:^|,|\s)body[\s.,{]|:root/) || families[0] || displayFam;
    const stack = (f?: string) => (f ? `'${f}', system-ui, sans-serif` : undefined);
    return {
      display: stack(displayFam),
      body: stack(bodyFam),
      cssHref: ensureFontDisplay(href),
    };
  }

  // 2) Adobe Fonts / Typekit — load the sheet even though we can't name the family.
  const tk = html.match(/<link\b[^>]*href=["'](https:\/\/use\.typekit\.net\/[^"']+)["']/i);
  if (tk) return { cssHref: decodeEntities(tk[1]) };

  // 3) No web-font service — read the family the CSS actually applies to
  //    headings/body and try to load it from Google Fonts (which covers the
  //    large majority of brand fonts). Falls through cleanly if we find nothing.
  const displayFam = fontFamilyFor(combined, /(?:^|,|\s)h1[\s.,:{]|heading|title|display/);
  const bodyFam = fontFamilyFor(combined, /(?:^|,|\s)body[\s.,{]|:root|html[\s.,{]/);
  const chosen = [displayFam, bodyFam].filter((f): f is string => Boolean(f));
  if (chosen.length === 0) return {};
  const uniq = Array.from(new Set(chosen)).slice(0, 2);
  const stack = (f: string) => `'${f}', system-ui, sans-serif`;
  return {
    display: stack(displayFam || bodyFam!),
    body: stack(bodyFam || displayFam!),
    cssHref: googleFontsHref(uniq),
  };
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
  // Pull the page's stylesheets so color/font scraping sees the real theme,
  // not just the (usually bare) initial HTML. Best-effort — failures degrade
  // to scanning the HTML alone.
  let cssText = '';
  try {
    cssText = await fetchStylesheets(html, finalUrl);
  } catch {
    /* degrade to HTML-only */
  }
  return parseBrandFromHtml(html, finalUrl, cssText);
}

/**
 * Parse a brand kit out of already-fetched HTML (+ optional stylesheet text).
 * Split out from the network fetch so it can be unit-tested deterministically.
 */
export function parseBrandFromHtml(html: string, finalUrl: string, cssText = ''): BrandKit {
  const host = new URL(finalUrl).hostname;

  const themeColor = metaContent(html, 'theme-color') || metaContent(html, 'msapplication-TileColor');
  const { signature, accent } = pickBrandColors(html, cssText, themeColor);
  const { imageUrl, markUrl } = findLogo(html, finalUrl);
  const fonts = findFonts(html, cssText);
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
