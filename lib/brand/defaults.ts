import type { BrandKit } from './types';

/**
 * The default brand — the Hatzikostas "Speaker Hub" seed.
 * Every new hub starts from this until the speaker brands it to
 * themselves (by importing their website at sign-up).
 */
export const DEFAULT_BRAND: BrandKit = {
  name: 'Speaker Hub',
  tagline: 'Every tool a speaker needs, in one place.',
  colors: {
    // Neutral black/white/navy default — the look before a speaker
    // personalizes their hub during setup.
    signature: '#17294E', // navy (refined: deeper, richer)
    accent: '#2E55AE', // steel-royal navy (links / accents — cleaner, more legible)
    ink: '#111114', // near-black
    paper: '#FFFFFF',
    page: '#F6F6F9',
    onSignature: '#FFFFFF', // white text on navy
  },
  fonts: {
    display: "'Montserrat', 'Gotham', system-ui, sans-serif",
    body: "'Montserrat', 'Gotham', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,600&family=Alex+Brush&family=Roboto+Mono:wght@400;500&display=swap',
  },
  logo: {
    type: 'wordmark',
    wordmarkText: 'Speaker Hub',
  },
  hero: {},
  voice: {
    tone: 'Polished, confident, human',
    greeting: "let's get to work.",
    about:
      'A single, deeply-branded command center that brings every tool a professional speaker needs into one place.',
  },
  source: 'default',
};

/** Build a fresh copy so callers can mutate without touching the constant. */
export function cloneDefaultBrand(): BrandKit {
  return JSON.parse(JSON.stringify(DEFAULT_BRAND));
}
