import type { BrandKit } from './types';
import { DEFAULT_BRAND, cloneDefaultBrand } from './defaults';
import { shade, readableTextOn, normalizeHex } from './color';

/**
 * Deep-merge a (possibly partial / loosely-typed) brand value from the
 * database over the default kit, so every consumer gets a complete kit.
 */
export function mergeBrand(input: unknown): BrandKit {
  const base = cloneDefaultBrand();
  if (!input || typeof input !== 'object') return base;
  const b = input as Partial<BrandKit>;

  return {
    name: b.name || base.name,
    tagline: b.tagline ?? base.tagline,
    oneSheet: b.oneSheet,
    colors: {
      signature: clean(b.colors?.signature) ?? base.colors.signature,
      accent: clean(b.colors?.accent) ?? base.colors.accent,
      ink: clean(b.colors?.ink) ?? base.colors.ink,
      paper: clean(b.colors?.paper) ?? base.colors.paper,
      page: clean(b.colors?.page) ?? base.colors.page,
      onSignature: clean(b.colors?.onSignature) ?? base.colors.onSignature,
    },
    fonts: {
      display: b.fonts?.display || base.fonts.display,
      body: b.fonts?.body || base.fonts.body,
      cssHref: b.fonts?.cssHref ?? base.fonts.cssHref,
    },
    logo: {
      type: b.logo?.type === 'image' ? 'image' : 'wordmark',
      wordmarkText: b.logo?.wordmarkText ?? b.name ?? base.logo.wordmarkText,
      imageUrl: b.logo?.imageUrl,
      markUrl: b.logo?.markUrl,
    },
    hero: { imageUrl: b.hero?.imageUrl },
    voice: {
      tone: b.voice?.tone || base.voice.tone,
      greeting: b.voice?.greeting ?? base.voice.greeting,
      about: b.voice?.about ?? base.voice.about,
    },
    source: b.source || 'custom',
    sourceUrl: b.sourceUrl,
    extractedAt: b.extractedAt,
  };
}

function clean(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return normalizeHex(v) ?? undefined;
}

/**
 * Turn a brand kit into the small set of CSS custom-property overrides
 * that re-skin the entire token system. Applied as an inline `style` on
 * the app shell, so the brand cascades to every descendant (and beats
 * the :root defaults from brand-tokens.css) with no flash on first paint.
 */
export function brandToCssVars(brand: BrandKit): Record<string, string> {
  const { signature, accent, ink, paper, page, onSignature } = brand.colors;
  const onSig = onSignature || readableTextOn(signature, ink, paper);

  return {
    '--signature': signature,
    '--signature-strong': shade(signature, -0.18),
    '--on-signature': onSig,
    // design-system primitives reference --yellow directly:
    '--yellow': signature,
    '--accent-2': accent,
    '--text-link': accent,
    '--focus-ring': accent,
    // ink cascades to text-strong, border-strong, surface-ink:
    '--ink': ink,
    '--ink-900': ink,
    '--ink-800': shade(ink, 0.12),
    // surfaces:
    '--paper': paper,
    '--surface-page': page,
    // type:
    '--font-display': brand.fonts.display,
    '--font-body': brand.fonts.body,
  };
}

/** Stylesheet href needed to load this brand's fonts, if any. */
export function brandFontHref(brand: BrandKit): string | undefined {
  return brand.fonts.cssHref || DEFAULT_BRAND.fonts.cssHref;
}

/** Convenience: the text shown as the wordmark when there's no image logo. */
export function wordmarkText(brand: BrandKit): string {
  return brand.logo.wordmarkText || brand.name || 'Speaker Hub';
}
