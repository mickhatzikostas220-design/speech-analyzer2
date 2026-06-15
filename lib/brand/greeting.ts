import type { BrandKit } from './types';

/**
 * Pick a short, on-voice greeting line for the hub home. The UI renders
 * it as "Hey {name}, {greeting}" so this returns just the second clause.
 *
 * Deterministic and offline by design — voice/tone steers the wording so
 * each speaker's hub reads in their register without an LLM round-trip on
 * every page load. (The kit stores the chosen line; it can be regenerated
 * from Settings.)
 */
const LINES: Record<string, string[]> = {
  bold: ["let's stir things up.", 'time to make some noise.', "let's go make them lean in."],
  warm: ["let's make today count.", 'good to have you back.', 'ready when you are.'],
  playful: ['ready to play?', "let's have some fun with this.", 'what are we cooking up today?'],
  professional: ["let's get to work.", 'your stage is set.', 'ready to prep your next talk.'],
};

export function generateGreeting(brand: BrandKit): string {
  const tone = (brand.voice.tone || '').toLowerCase();
  let bucket: keyof typeof LINES = 'warm';
  if (/bold|salt|pot-stirrer|irreverent|rebel|loud/.test(tone)) bucket = 'bold';
  else if (/playful|fun|cheeky|witty/.test(tone)) bucket = 'playful';
  else if (/professional|polished|corporate|formal|expert/.test(tone)) bucket = 'professional';

  const options = LINES[bucket];
  // Stable per-name choice so it doesn't change on every render.
  const seed = (brand.name || 'Speaker').split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  return options[seed % options.length];
}
