/**
 * Small, dependency-free color helpers used by brand extraction
 * and theming. Everything works on `#rrggbb` / `#rgb` hex strings.
 */

export function normalizeHex(input: string): string | null {
  if (!input) return null;
  let hex = input.trim().toLowerCase();
  const named: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
  };
  if (named[hex]) hex = named[hex];
  const m = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex) ?? '#000000';
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Relative luminance (0 dark – 1 light), WCAG-style. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/** HSL saturation of a color (0–1) — used to find a "loud" signature. */
export function saturation(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/** Pick the most readable text color (ink vs paper) for a background. */
export function readableTextOn(bg: string, ink = '#1a1a1a', paper = '#ffffff'): string {
  // Contrast against the darker option; if the bg is light, use ink.
  return luminance(bg) > 0.45 ? ink : paper;
}

/** Lighten (amount > 0) or darken (amount < 0) toward white/black. -1..1 */
export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (amount >= 0) {
    return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  const k = 1 + amount;
  return toHex(r * k, g * k, b * k);
}

/** True for near-white, near-black, or very desaturated (grey) colors. */
export function isNeutral(hex: string): boolean {
  const l = luminance(hex);
  if (l > 0.92 || l < 0.04) return true;
  return saturation(hex) < 0.12;
}
