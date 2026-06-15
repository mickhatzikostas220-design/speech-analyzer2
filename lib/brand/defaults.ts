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
    signature: '#F8E337', // brand yellow
    accent: '#01B0DD', // brand blue
    ink: '#1A1A1A',
    paper: '#FFFFFF',
    page: '#F8F8F6',
    onSignature: '#1A1A1A',
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
    tone: 'Bold, warm, second-person, anti-corporate-BS',
    greeting: "Let's stir things up.",
    about:
      'A single, deeply-branded command center that brings every tool a professional speaker needs into one place.',
  },
  source: 'default',
};

/** Build a fresh copy so callers can mutate without touching the constant. */
export function cloneDefaultBrand(): BrandKit {
  return JSON.parse(JSON.stringify(DEFAULT_BRAND));
}
