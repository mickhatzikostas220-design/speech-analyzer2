// Turns the on-page signals we already scrape (see app/api/seo/route.ts) into a
// concrete, scored audit — an SEO score, an AEO score, and a per-check pass/warn/
// fail list with the ACTUAL value we found on the page. This is what makes the
// tool feel like a real check instead of a bag of generic tips: the speaker sees
// exactly what their site does and doesn't have, and the AI tips are anchored to
// the same findings.
//
// Fully defensive: reads every field off a loose object so a shape change in the
// scraper can never throw here. Weighting is deliberately simple and transparent
// (pass = full credit, warn = half, fail = none) so the score is explainable.

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** The concrete thing we found on the page, shown to the user as evidence. */
  found: string;
  dimension: 'seo' | 'aeo';
}

export interface AuditResult {
  seoScore: number;
  aeoScore: number;
  checks: AuditCheck[];
}

// ── loose readers (never throw) ──────────────────────────────────────────────
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const truncate = (s: string, n = 80): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function scoreOf(checks: AuditCheck[], dimension: 'seo' | 'aeo'): number {
  const dim = checks.filter((c) => c.dimension === dimension);
  if (dim.length === 0) return 0;
  const earned = dim.reduce((sum, c) => sum + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  return Math.round((earned / dim.length) * 100);
}

/** Score a scraped-signals object into an explainable SEO + AEO audit. */
export function scoreSignals(signals: Record<string, unknown>): AuditResult {
  const s = signals ?? {};
  const checks: AuditCheck[] = [];
  const add = (
    dimension: 'seo' | 'aeo',
    id: string,
    label: string,
    status: CheckStatus,
    found: string
  ) => checks.push({ dimension, id, label, status, found });

  // ── SEO ──────────────────────────────────────────────────────────────────
  const title = str(s.title);
  add(
    'seo',
    'title',
    'Title tag',
    title ? (title.length >= 10 && title.length <= 65 ? 'pass' : 'warn') : 'fail',
    title ? `“${truncate(title)}” (${title.length} chars)` : 'No <title> found'
  );

  const meta = str(s.metaDescription);
  add(
    'seo',
    'meta',
    'Meta description',
    meta ? (meta.length >= 50 && meta.length <= 165 ? 'pass' : 'warn') : 'fail',
    meta ? `${meta.length} chars` : 'Missing'
  );

  add(
    'seo',
    'indexable',
    'Search-indexable',
    bool(s.indexable) ? 'pass' : 'fail',
    bool(s.indexable) ? 'No noindex — search engines can list it' : 'Blocked by noindex'
  );

  const h1 = num(s.h1Count);
  add(
    'seo',
    'h1',
    'Single clear H1',
    h1 === 1 ? 'pass' : h1 === 0 ? 'fail' : 'warn',
    h1 === 0 ? 'No H1 on the page' : h1 === 1 ? `“${truncate(str(s.firstH1) || 'present')}”` : `${h1} H1s (should be one)`
  );

  add(
    'seo',
    'canonical',
    'Canonical URL',
    str(s.canonical) ? 'pass' : 'warn',
    str(s.canonical) ? 'Set' : 'Not set'
  );

  add(
    'seo',
    'viewport',
    'Mobile viewport',
    bool(s.hasViewport) ? 'pass' : 'fail',
    bool(s.hasViewport) ? 'Responsive viewport tag present' : 'Missing viewport meta'
  );

  const imgCount = num(s.imgCount);
  const missingAlt = num(s.imgMissingAlt);
  add(
    'seo',
    'alt',
    'Image alt text',
    imgCount === 0 || missingAlt === 0 ? 'pass' : missingAlt <= Math.ceil(imgCount / 2) ? 'warn' : 'fail',
    imgCount === 0 ? 'No images' : `${missingAlt} of ${imgCount} images missing alt text`
  );

  const words = num(s.wordCount);
  add(
    'seo',
    'content',
    'Content depth',
    words >= 600 ? 'pass' : words >= 250 ? 'warn' : 'fail',
    `${words} words on the page`
  );

  add(
    'seo',
    'sitemap',
    'Sitemap declared',
    bool(s.declaresSitemap) ? 'pass' : 'warn',
    bool(s.declaresSitemap) ? 'robots.txt points to a sitemap' : 'No sitemap in robots.txt'
  );

  const ogOk = str(s.ogTitle) && str(s.ogImage);
  add(
    'seo',
    'og',
    'Social share preview',
    ogOk ? 'pass' : str(s.ogTitle) || str(s.ogImage) ? 'warn' : 'fail',
    ogOk ? 'Open Graph title + image set' : 'Incomplete Open Graph tags'
  );

  // ── AEO / GEO (getting cited by AI answer engines) ────────────────────────
  add(
    'aeo',
    'person',
    'Person / speaker entity',
    bool(s.hasPersonSchema) ? 'pass' : 'fail',
    bool(s.hasPersonSchema) ? 'Person JSON-LD present' : 'No Person schema — AI can’t identify you as an entity'
  );

  const jsonLd = arr(s.jsonLdTypes).map((t) => str(t)).filter(Boolean);
  add(
    'aeo',
    'structured',
    'Structured data',
    jsonLd.length ? 'pass' : 'fail',
    jsonLd.length ? `Found: ${truncate(jsonLd.join(', '), 90)}` : 'No JSON-LD structured data'
  );

  add(
    'aeo',
    'faq',
    'FAQ schema',
    bool(s.hasFaqSchema) ? 'pass' : 'warn',
    bool(s.hasFaqSchema) ? 'FAQPage/Question present' : 'No FAQ schema for booking questions'
  );

  add(
    'aeo',
    'speakable',
    'Speakable schema',
    bool(s.hasSpeakableSchema) ? 'pass' : 'warn',
    bool(s.hasSpeakableSchema) ? 'Speakable present' : 'No speakable markup (voice/AI extraction)'
  );

  const questions = arr(s.questionHeadings).length;
  add(
    'aeo',
    'questions',
    'Question-shaped headings',
    questions >= 3 ? 'pass' : questions >= 1 ? 'warn' : 'fail',
    questions ? `${questions} question heading${questions === 1 ? '' : 's'}` : 'None — add headings that mirror what people ask AI'
  );

  const socials = arr(s.socialProfiles).map((t) => str(t)).filter(Boolean);
  add(
    'aeo',
    'sameas',
    'Linked profiles (sameAs)',
    socials.length >= 2 ? 'pass' : socials.length === 1 ? 'warn' : 'fail',
    socials.length ? `Links to ${socials.join(', ')}` : 'No linked social/professional profiles'
  );

  add(
    'aeo',
    'org',
    'Organization schema',
    bool(s.hasOrganizationSchema) ? 'pass' : 'warn',
    bool(s.hasOrganizationSchema) ? 'Organization JSON-LD present' : 'No Organization schema'
  );

  add(
    'aeo',
    'lang',
    'Language declared',
    str(s.htmlLang) ? 'pass' : 'warn',
    str(s.htmlLang) ? `lang="${truncate(str(s.htmlLang), 20)}"` : 'No html lang attribute'
  );

  return {
    seoScore: scoreOf(checks, 'seo'),
    aeoScore: scoreOf(checks, 'aeo'),
    checks,
  };
}

/**
 * A compact text summary of what FAILED or needs work, for feeding into the AI
 * tips prompt so the advice lines up with the visible audit. '' when all good.
 */
export function auditToPromptBlock(audit: AuditResult): string {
  const issues = audit.checks.filter((c) => c.status !== 'pass');
  if (issues.length === 0) return '';
  const line = (c: AuditCheck) => `- [${c.status.toUpperCase()}] ${c.label}: ${c.found}`;
  return [
    `OUR AUTOMATED AUDIT of this page scored SEO ${audit.seoScore}/100 and AEO ${audit.aeoScore}/100. It flagged these — your tips MUST address the biggest of these real, verified findings first (don't invent problems that aren't here):`,
    ...issues.map(line),
  ].join('\n');
}
